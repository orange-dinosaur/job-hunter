import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { langs } from "../../cv/render.ts";
import { DATA_DIR } from "../../db/migrate.ts";
import {
  followUpDue,
  getOffer,
  markFollowedUp,
  offerStatuses,
  oldPosting,
  setStatus,
} from "../../db/offers.ts";
import { loadProfile } from "../../profile/load.ts";
import type { OperationType } from "../../runner/models.ts";
import { bandFor } from "../../scoring.ts";
import { runOperation } from "../../runner/run-claude.ts";
import type { SearchOperation } from "./runs.ts";

const statusInput = z.strictObject({
  status: z.enum(offerStatuses),
  note: z.string().nullable(),
});

const langInput = z.strictObject({ lang: z.enum(langs) });

const notFound = () =>
  Response.json({ error: "no such offer" }, { status: 404 });

const kitDir = (dataDir: string, id: string, lang: string) =>
  join(dataDir, "offers", id, `kit-${lang}`);

// Languages an offer has a saved kit in.
export const kitLangs = (dataDir: string, id: string) =>
  langs.filter((lang) => existsSync(kitDir(dataDir, id, lang)));

const readText = (file: string) =>
  existsSync(file) ? readFileSync(file, "utf8") : null;

// Null when the file is missing, which for older kits and letters means "never checked".
function readJson<T>(file: string): T | null {
  const text = readText(file);
  return text == null ? null : JSON.parse(text);
}

type Unsupported = { claim: string; where: string }[];

function readKit(dataDir: string, id: string, lang: string) {
  const dir = kitDir(dataDir, id, lang);
  return {
    lang,
    has_pdf: existsSync(join(dir, "cv.pdf")),
    steps: readText(join(dir, "steps.md")),
    suggestions:
      readJson<{ text?: string }[]>(join(dir, "suggestions.json")) ?? [],
    keywords: readJson<{ term: string; covered: boolean }[]>(
      join(dir, "keywords.json"),
    ),
    unsupported: readJson<Unsupported>(join(dir, "factcheck.json")),
  };
}

const letterFile = (dataDir: string, id: string, lang: string, ext: string) =>
  join(dataDir, "offers", id, `cover-letter-${lang}.${ext}`);

function readLetters(dataDir: string, id: string) {
  return langs.flatMap((lang) => {
    const md = letterFile(dataDir, id, lang, "md");
    if (!existsSync(md)) return [];
    return [
      {
        lang,
        text: readFileSync(md, "utf8"),
        has_pdf: existsSync(letterFile(dataDir, id, lang, "pdf")),
        unsupported: readJson<Unsupported>(
          letterFile(dataDir, id, lang, "factcheck.json"),
        ),
      },
    ];
  });
}

const readFollowUps = (dataDir: string, id: string) =>
  langs.flatMap((lang) => {
    const text = readText(join(dataDir, "offers", id, `follow-up-${lang}.md`));
    return text == null ? [] : [{ lang, text }];
  });

function detail(db: Database, dataDir: string, id: string) {
  const offer = getOffer(db, id);
  if (!offer) return null;
  const file = join(dataDir, "offers", id, "offer.md");
  const latest = (type: OperationType) =>
    db
      .query<SearchOperation, [OperationType, string]>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = ? AND offer_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(type, id);
  const profile = loadProfile(join(dataDir, "search-profile.yaml"));
  return {
    ...offer,
    text: existsSync(file) ? readFileSync(file, "utf8") : null,
    weights: profile.weights,
    band: bandFor(offer.fit_score, profile.bands),
    follow_up_due: followUpDue(offer, profile.follow_up_days),
    old_posting: oldPosting(offer.first_seen_at),
    kits: kitLangs(dataDir, id).map((lang) => readKit(dataDir, id, lang)),
    kit_operation: latest("application_kit"),
    letters: readLetters(dataDir, id),
    letter_operation: latest("cover_letter"),
    follow_ups: readFollowUps(dataDir, id),
    follow_up_operation: latest("follow_up"),
  };
}

export type OfferDetail = NonNullable<ReturnType<typeof detail>>;

export function offerRoutes(db: Database, dataDir = DATA_DIR) {
  const badInput = (error: z.ZodError) =>
    Response.json({ error: z.prettifyError(error) }, { status: 400 });

  return {
    "/api/offers/:id": {
      GET(req: Bun.BunRequest<"/api/offers/:id">) {
        const offer = detail(db, dataDir, req.params.id);
        return offer ? Response.json(offer) : notFound();
      },
    },
    "/api/offers/:id/status": {
      async POST(req: Bun.BunRequest<"/api/offers/:id/status">) {
        if (!getOffer(db, req.params.id)) return notFound();
        const input = statusInput.safeParse(await req.json().catch(() => null));
        if (!input.success) return badInput(input.error);
        setStatus(
          db,
          req.params.id,
          input.data.status,
          input.data.note || null,
        );
        return Response.json(detail(db, dataDir, req.params.id));
      },
    },
    "/api/offers/:id/prepare": {
      POST: (req: Bun.BunRequest<"/api/offers/:id/prepare">) =>
        start(req, "application_kit"),
    },
    "/api/offers/:id/cover-letter": {
      POST: (req: Bun.BunRequest<"/api/offers/:id/cover-letter">) =>
        start(req, "cover_letter"),
    },
    "/api/offers/:id/follow-up": {
      POST: (req: Bun.BunRequest<"/api/offers/:id/follow-up">) =>
        start(req, "follow_up"),
    },
    "/api/offers/:id/followed-up": {
      POST(req: Bun.BunRequest<"/api/offers/:id/followed-up">) {
        if (!getOffer(db, req.params.id)) return notFound();
        markFollowedUp(db, req.params.id);
        return Response.json(detail(db, dataDir, req.params.id));
      },
    },
    "/api/offers/:id/kit/:lang/cv.pdf": {
      GET: (req: Bun.BunRequest<"/api/offers/:id/kit/:lang/cv.pdf">) =>
        pdf(req.params, (id, lang) =>
          join(kitDir(dataDir, id, lang), "cv.pdf"),
        ),
    },
    "/api/offers/:id/letter/:lang/cover-letter.pdf": {
      GET: (
        req: Bun.BunRequest<"/api/offers/:id/letter/:lang/cover-letter.pdf">,
      ) => pdf(req.params, (id, lang) => letterFile(dataDir, id, lang, "pdf")),
    },
  };

  // Starts a per-offer operation that runs `/<command> <id> <lang>`.
  async function start(
    req: Request & { params: { id: string } },
    type: OperationType,
  ) {
    const id = req.params.id;
    if (!getOffer(db, id)) return notFound();
    const input = langInput.safeParse(await req.json().catch(() => null));
    if (!input.success) return badInput(input.error);
    runOperation(db, type, { offerId: id, args: [id, input.data.lang] });
    return Response.json(detail(db, dataDir, id));
  }

  function pdf(
    params: { id: string; lang: string },
    path: (id: string, lang: string) => string,
  ) {
    const { id, lang } = params;
    // Both checks keep the params from reaching the file path unvetted.
    if (!getOffer(db, id) || !z.enum(langs).safeParse(lang).success)
      return notFound();
    const file = path(id, lang);
    if (!existsSync(file))
      return Response.json({ error: "no PDF" }, { status: 404 });
    return new Response(Bun.file(file), {
      headers: { "content-type": "application/pdf" },
    });
  }
}

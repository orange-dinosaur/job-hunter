import type { Database } from "bun:sqlite";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { langs } from "../../cv/render.ts";
import { DATA_DIR } from "../../db/migrate.ts";
import { getOffer, offerStatuses, setStatus } from "../../db/offers.ts";
import { loadProfile } from "../../profile/load.ts";
import { runOperation } from "../../runner/run-claude.ts";
import type { SearchOperation } from "./runs.ts";

const statusInput = z.strictObject({
  status: z.enum(offerStatuses),
  note: z.string().nullable(),
});

const prepareInput = z.strictObject({ lang: z.enum(langs) });

const notFound = () =>
  Response.json({ error: "no such offer" }, { status: 404 });

const kitDir = (dataDir: string, id: string, lang: string) =>
  join(dataDir, "offers", id, `kit-${lang}`);

// Languages an offer has a saved kit in.
export const kitLangs = (dataDir: string, id: string) =>
  langs.filter((lang) => existsSync(kitDir(dataDir, id, lang)));

function readKit(dataDir: string, id: string, lang: string) {
  const dir = kitDir(dataDir, id, lang);
  const read = (name: string) =>
    existsSync(join(dir, name)) ? readFileSync(join(dir, name), "utf8") : null;
  const suggestions = read("suggestions.json");
  return {
    lang,
    has_pdf: existsSync(join(dir, "cv.pdf")),
    steps: read("steps.md"),
    suggestions: (suggestions ? JSON.parse(suggestions) : []) as {
      text?: string;
    }[],
  };
}

function detail(db: Database, dataDir: string, id: string) {
  const offer = getOffer(db, id);
  if (!offer) return null;
  const file = join(dataDir, "offers", id, "offer.md");
  return {
    ...offer,
    text: existsSync(file) ? readFileSync(file, "utf8") : null,
    weights: loadProfile(join(dataDir, "search-profile.yaml")).weights,
    kits: kitLangs(dataDir, id).map((lang) => readKit(dataDir, id, lang)),
    kit_operation: db
      .query<SearchOperation, [string]>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = 'application_kit' AND offer_id = ? ORDER BY id DESC LIMIT 1",
      )
      .get(id),
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
      async POST(req: Bun.BunRequest<"/api/offers/:id/prepare">) {
        const id = req.params.id;
        if (!getOffer(db, id)) return notFound();
        const input = prepareInput.safeParse(
          await req.json().catch(() => null),
        );
        if (!input.success) return badInput(input.error);
        runOperation(db, "application_kit", {
          offerId: id,
          args: [id, input.data.lang],
        });
        return Response.json(detail(db, dataDir, id));
      },
    },
    "/api/offers/:id/kit/:lang/cv.pdf": {
      GET(req: Bun.BunRequest<"/api/offers/:id/kit/:lang/cv.pdf">) {
        const { id, lang } = req.params;
        // Both checks keep the params from reaching the file path unvetted.
        if (!getOffer(db, id) || !z.enum(langs).safeParse(lang).success)
          return notFound();
        const path = join(kitDir(dataDir, id, lang), "cv.pdf");
        if (!existsSync(path))
          return Response.json({ error: "no kit PDF" }, { status: 404 });
        return new Response(Bun.file(path), {
          headers: { "content-type": "application/pdf" },
        });
      },
    },
  };
}

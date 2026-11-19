import type { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { diffCv } from "../../cv/diff.ts";
import { masterCvSchema } from "../../cv/schema.ts";
import {
  confirmCv,
  currentCv,
  getCv,
  latestConfirmedCv,
  listCvVersions,
  originalPdfFor,
  overwriteDraft,
  saveCv,
} from "../../db/cv.ts";
import { getOffer } from "../../db/offers.ts";
import {
  getSuggestion,
  listSuggestions,
  resolveSuggestion,
} from "../../db/suggestions.ts";
import type { OperationType } from "../../runner/models.ts";
import { runOperation } from "../../runner/run-claude.ts";
import type { SearchOperation } from "./runs.ts";

const MAX_PDF_BYTES = 20 * 1024 * 1024;

const error = (message: string, status = 400) =>
  Response.json({ error: message }, { status });

const versionParam = (raw: string) => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

function cvState(db: Database, dataDir: string) {
  const current = currentCv(db, dataDir);
  const confirmed = latestConfirmedCv(db, dataDir);
  return {
    current,
    // What changed since the last confirmed version, while the newest is unconfirmed.
    changes:
      current && confirmed && !current.confirmed
        ? { against: confirmed.version, list: diffCv(confirmed.cv, current.cv) }
        : null,
    has_pdf: current ? originalPdfFor(db, current.version) !== null : false,
    versions: listCvVersions(db),
    import: latestOperation(db, "cv_import"),
    apply: latestOperation(db, "cv_suggestion"),
    suggestions: listSuggestions(db, "open").map((s) => ({
      ...s,
      offers: s.offer_ids.flatMap((id) => {
        const o = getOffer(db, id);
        return o ? [{ id, title: o.title, company: o.company }] : [];
      }),
    })),
  };
}

const latestOperation = (db: Database, type: OperationType) =>
  db
    .query<SearchOperation, [OperationType]>(
      "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = ? ORDER BY id DESC LIMIT 1",
    )
    .get(type);

const answerInput = z.strictObject({
  answer: z.string().trim().min(1).max(2000),
});

export type CvState = ReturnType<typeof cvState>;

export function cvRoutes(db: Database, dataDir: string) {
  const state = () => Response.json(cvState(db, dataDir));

  return {
    "/api/cv": { GET: state },

    "/api/cv/import": {
      async POST(req: Request) {
        const form = await req.formData().catch(() => null);
        const file = form?.get("file");
        if (!(file instanceof File)) return error("no file in the upload");
        if (!file.name.toLowerCase().endsWith(".pdf"))
          return error("only PDF files can be imported");
        if (file.size > MAX_PDF_BYTES) return error("the PDF is over 20 MB");
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
          return error("the file is not a PDF");

        const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
        const name = file.name.replace(/[^A-Za-z0-9._-]/g, "_");
        mkdirSync(join(dataDir, "cv/uploads"), { recursive: true });
        // ponytail: uploads are kept after import; delete them by hand if they pile up.
        const rel = `data/cv/uploads/${stamp}-${name}`;
        await Bun.write(join(dataDir, "cv/uploads", `${stamp}-${name}`), bytes);
        runOperation(db, "cv_import", { args: [rel] });
        return state();
      },
    },

    "/api/cv/suggestions/:id/dismiss": {
      POST(req: Bun.BunRequest<"/api/cv/suggestions/:id/dismiss">) {
        const id = versionParam(req.params.id);
        if (!id || getSuggestion(db, id)?.status !== "open")
          return error("no such open suggestion", 404);
        resolveSuggestion(db, id, "dismissed", null);
        return state();
      },
    },

    // Claude works the answer into the CV and saves an unconfirmed version.
    "/api/cv/suggestions/:id/accept": {
      async POST(req: Bun.BunRequest<"/api/cv/suggestions/:id/accept">) {
        const id = versionParam(req.params.id);
        if (!id || getSuggestion(db, id)?.status !== "open")
          return error("no such open suggestion", 404);
        const input = answerInput.safeParse(await req.json().catch(() => null));
        if (!input.success) return error("write what is true first");
        runOperation(db, "cv_suggestion", {
          args: [String(id), input.data.answer],
        });
        return state();
      },
    },

    "/api/cv/:version/pdf": {
      GET(req: Bun.BunRequest<"/api/cv/:version/pdf">) {
        const version = versionParam(req.params.version);
        const ref = version && originalPdfFor(db, version);
        if (!ref) return error("no original PDF", 404);
        const originals = resolve(dataDir, "cv/originals") + sep;
        const path = resolve(dataDir, ref);
        if (!path.startsWith(originals)) return error("no original PDF", 404);
        return new Response(Bun.file(path), {
          headers: { "content-type": "application/pdf" },
        });
      },
    },

    "/api/cv/:version": {
      async PUT(req: Bun.BunRequest<"/api/cv/:version">) {
        const version = versionParam(req.params.version);
        if (!version || !getCv(db, dataDir, version))
          return error("no such version", 404);
        const input = masterCvSchema.safeParse(
          await req.json().catch(() => null),
        );
        if (!input.success) return error(z.prettifyError(input.error));
        if (!overwriteDraft(db, dataDir, version, input.data))
          return error("a confirmed version cannot be edited", 409);
        return state();
      },
    },

    "/api/cv/:version/confirm": {
      POST(req: Bun.BunRequest<"/api/cv/:version/confirm">) {
        const version = versionParam(req.params.version);
        if (!version || !getCv(db, dataDir, version))
          return error("no such version", 404);
        confirmCv(db, version);
        return state();
      },
    },

    // Copies a version into a new unconfirmed one. Also how a confirmed CV gets edited.
    "/api/cv/:version/restore": {
      POST(req: Bun.BunRequest<"/api/cv/:version/restore">) {
        const version = versionParam(req.params.version);
        const cv = version && getCv(db, dataDir, version);
        if (!cv) return error("no such version", 404);
        saveCv(
          db,
          dataDir,
          cv.cv,
          "restore",
          `v${String(version).padStart(3, "0")}`,
        );
        return state();
      },
    },
  };
}

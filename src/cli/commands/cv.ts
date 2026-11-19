import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { currentCv, saveCv } from "../../db/cv.ts";
import { getSuggestion, resolveSuggestion } from "../../db/suggestions.ts";
import { langs, renderCv, type Lang } from "../../cv/render.ts";
import { masterCvSchema } from "../../cv/schema.ts";
import {
  CommandError,
  readInput,
  requiredFlag,
  type Command,
} from "../command.ts";

const origins = ["import", "suggestion", "restore"] as const;

export const cvCommands: Record<string, Command> = {
  "cv:current": {
    help: "Print the newest master CV version",
    run(ctx) {
      return currentCv(ctx.db, ctx.dataDir);
    },
  },
  "cv:original": {
    help: "Copy a CV PDF into data/cv/originals/ and print its path (--file)",
    options: { file: { type: "string" } },
    run(ctx, flags) {
      const file = requiredFlag(flags, "file");
      if (extname(file).toLowerCase() !== ".pdf")
        throw new CommandError(
          "only PDF files can be imported. Export the CV to PDF first.",
        );
      if (!existsSync(file)) throw new CommandError(`no file at ${file}`);
      const stamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace(/[-:]/g, "")
        .replace("T", "-");
      const ref = `cv/originals/${stamp}-${basename(file)}`;
      const path = join(ctx.dataDir, ref);
      mkdirSync(join(ctx.dataDir, "cv/originals"), { recursive: true });
      copyFileSync(file, path);
      return { path, ref };
    },
  },
  "cv:render": {
    help: "Render a CV JSON file to PDF (--file, --lang it|en, --out). Uses data/photo.jpg if present",
    options: {
      file: { type: "string" },
      lang: { type: "string" },
      out: { type: "string" },
    },
    run(ctx, flags) {
      const file = requiredFlag(flags, "file");
      const lang = requiredFlag(flags, "lang");
      const out = requiredFlag(flags, "out");
      if (!z.enum(langs).safeParse(lang).success)
        throw new CommandError(`--lang must be one of ${langs.join(", ")}`);
      if (!existsSync(file)) throw new CommandError(`no file at ${file}`);
      const cv = readInput(masterCvSchema, readFileSync(file, "utf8"));
      renderCv(cv, lang as Lang, out, join(ctx.dataDir, "photo.jpg"));
      return { path: out };
    },
  },
  "cv:save": {
    help: "Save a new master CV version (--origin import|suggestion|restore, --ref, stdin: CV JSON)",
    options: { origin: { type: "string" }, ref: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const origin = requiredFlag(flags, "origin");
      if (!z.enum(origins).safeParse(origin).success)
        throw new CommandError(`--origin must be one of ${origins.join(", ")}`);
      const ref = typeof flags.ref === "string" ? flags.ref : null;
      // A suggestion version must name an open suggestion as `s<id>`, which it then closes.
      let suggestionId: number | null = null;
      if (origin === "suggestion") {
        suggestionId = Number(/^s(\d+)$/.exec(ref ?? "")?.[1]);
        if (getSuggestion(ctx.db, suggestionId)?.status !== "open")
          throw new CommandError(
            "--ref must be s<id> of an open suggestion for --origin suggestion",
          );
      }
      const cv = readInput(masterCvSchema, stdin);
      const saved = saveCv(
        ctx.db,
        ctx.dataDir,
        cv,
        origin as (typeof origins)[number],
        ref,
      );
      if (suggestionId !== null)
        resolveSuggestion(ctx.db, suggestionId, "accepted", saved.id);
      return saved;
    },
  },
};

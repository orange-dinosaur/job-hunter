import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import { currentCv, saveCv } from "../../db/cv.ts";
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
  "cv:save": {
    help: "Save a new master CV version (--origin import|suggestion|restore, --ref, stdin: CV JSON)",
    options: { origin: { type: "string" }, ref: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const origin = requiredFlag(flags, "origin");
      if (!z.enum(origins).safeParse(origin).success)
        throw new CommandError(`--origin must be one of ${origins.join(", ")}`);
      const cv = readInput(masterCvSchema, stdin);
      return saveCv(
        ctx.db,
        ctx.dataDir,
        cv,
        origin as (typeof origins)[number],
        typeof flags.ref === "string" ? flags.ref : null,
      );
    },
  },
};

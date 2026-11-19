import { z } from "zod";
import { currentCv, saveCv } from "../../db/cv.ts";
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
  "cv:save": {
    help: "Save a new master CV version (--origin import|suggestion|restore, --ref, stdin: CV JSON)",
    options: { origin: { type: "string" }, ref: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const origin = requiredFlag(flags, "origin");
      if (!z.enum(origins).safeParse(origin).success)
        throw new CommandError(`--origin must be one of ${origins.join(", ")}`);
      const cv = readInput(z.record(z.string(), z.unknown()), stdin);
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

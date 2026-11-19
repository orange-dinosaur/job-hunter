import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getOffer, markPrepared } from "../../db/offers.ts";
import {
  CommandError,
  readInput,
  requiredFlag,
  type Command,
} from "../command.ts";

const kitInput = z.strictObject({
  cv: z.record(z.string(), z.unknown()),
  steps: z.string().min(1),
  suggestions: z.array(z.unknown()),
});

export const kitCommands: Record<string, Command> = {
  "kit:save": {
    help: "Save an application kit and mark the offer prepared (--id, --lang it|en, stdin: cv, steps, suggestions)",
    options: { id: { type: "string" }, lang: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const id = requiredFlag(flags, "id");
      const lang = requiredFlag(flags, "lang");
      if (lang !== "it" && lang !== "en")
        throw new CommandError("--lang must be it or en");
      // Checking the offer exists also keeps the id from reaching the file path unvetted.
      if (!getOffer(ctx.db, id)) throw new CommandError(`no offer ${id}`);
      const kit = readInput(kitInput, stdin);

      const dir = join(ctx.dataDir, "offers", id, `kit-${lang}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "cv.json"),
        JSON.stringify(kit.cv, null, 2) + "\n",
      );
      writeFileSync(join(dir, "steps.md"), kit.steps.trimEnd() + "\n");
      writeFileSync(
        join(dir, "suggestions.json"),
        JSON.stringify(kit.suggestions, null, 2) + "\n",
      );
      markPrepared(ctx.db, id);
      return { dir, status: getOffer(ctx.db, id)!.status };
    },
  },
};

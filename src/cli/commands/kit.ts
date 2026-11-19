import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import { letterView, renderLetter } from "../../cv/render.ts";
import { masterCvSchema } from "../../cv/schema.ts";
import { currentCv } from "../../db/cv.ts";
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

const letterInput = z.strictObject({ text: z.string().trim().min(1) });

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
  "letter:save": {
    help: "Save a cover letter and render its PDF (--id, --lang it|en, stdin: text)",
    options: { id: { type: "string" }, lang: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const id = requiredFlag(flags, "id");
      const lang = requiredFlag(flags, "lang");
      if (lang !== "it" && lang !== "en")
        throw new CommandError("--lang must be it or en");
      const offer = getOffer(ctx.db, id);
      if (!offer) throw new CommandError(`no offer ${id}`);
      const cv = currentCv(ctx.db, ctx.dataDir);
      if (!cv) throw new CommandError("no master CV");
      const { text } = readInput(letterInput, stdin);

      const base = join(ctx.dataDir, "offers", id, `cover-letter-${lang}`);
      mkdirSync(dirname(base), { recursive: true });
      writeFileSync(`${base}.md`, text.trim() + "\n");
      renderLetter(
        letterView(masterCvSchema.parse(cv.cv).personal, offer, text, lang),
        `${base}.pdf`,
      );
      return {
        text: `${base}.md`,
        pdf: `${base}.pdf`,
        words: text.trim().split(/\s+/).length,
      };
    },
  },
};

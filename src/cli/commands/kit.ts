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

// Claims in the output the master CV does not support. An empty list means checked and clean.
const unsupported = z.array(
  z.strictObject({
    claim: z.string().trim().min(1),
    where: z.string().trim().min(1),
  }),
);

const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";

const kitInput = z.strictObject({
  cv: z.record(z.string(), z.unknown()),
  steps: z.string().min(1),
  suggestions: z.array(z.unknown()),
  keywords: z.array(
    z.strictObject({ term: z.string().trim().min(1), covered: z.boolean() }),
  ),
  unsupported,
});

const letterInput = z.strictObject({
  text: z.string().trim().min(1),
  unsupported,
});

export const kitCommands: Record<string, Command> = {
  "kit:save": {
    help: "Save an application kit and mark the offer prepared (--id, --lang it|en, stdin: cv, steps, suggestions, keywords, unsupported)",
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
      writeFileSync(join(dir, "cv.json"), json(kit.cv));
      writeFileSync(join(dir, "steps.md"), kit.steps.trimEnd() + "\n");
      writeFileSync(join(dir, "suggestions.json"), json(kit.suggestions));
      writeFileSync(join(dir, "keywords.json"), json(kit.keywords));
      writeFileSync(join(dir, "factcheck.json"), json(kit.unsupported));
      markPrepared(ctx.db, id);
      return { dir, status: getOffer(ctx.db, id)!.status };
    },
  },
  "letter:save": {
    help: "Save a cover letter and render its PDF (--id, --lang it|en, stdin: text, unsupported)",
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
      const { text, unsupported } = readInput(letterInput, stdin);

      const base = join(ctx.dataDir, "offers", id, `cover-letter-${lang}`);
      mkdirSync(dirname(base), { recursive: true });
      writeFileSync(`${base}.md`, text.trim() + "\n");
      writeFileSync(`${base}.factcheck.json`, json(unsupported));
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

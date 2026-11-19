import { z } from "zod";
import { getOffer } from "../../db/offers.ts";
import {
  addOfferToSuggestion,
  createSuggestion,
  getSuggestion,
  listSuggestions,
  type SuggestionStatus,
} from "../../db/suggestions.ts";
import { CommandError, readInput, type Command } from "../command.ts";

const statuses = ["open", "accepted", "dismissed"] as const;

const addInput = z.union([
  z.strictObject({ text: z.string().min(1), offer_id: z.string().min(1) }),
  z.strictObject({ id: z.int(), offer_id: z.string().min(1) }),
]);

export const suggestionsCommands: Record<string, Command> = {
  "suggestions:list": {
    help: "List CV suggestions, most requested first (--status open|accepted|dismissed)",
    options: { status: { type: "string" } },
    run(ctx, flags) {
      const status = flags.status;
      if (
        status !== undefined &&
        !statuses.includes(status as SuggestionStatus)
      )
        throw new CommandError(
          `--status must be one of ${statuses.join(", ")}`,
        );
      return listSuggestions(ctx.db, status as SuggestionStatus | undefined);
    },
  },
  "suggestions:add": {
    help: "Add a CV suggestion (stdin: text and offer_id, or an existing id and offer_id)",
    stdin: true,
    run(ctx, _flags, stdin) {
      const input = readInput(addInput, stdin);
      if (!getOffer(ctx.db, input.offer_id))
        throw new CommandError(`no offer ${input.offer_id}`);
      if ("text" in input) {
        const id = createSuggestion(ctx.db, input.text, input.offer_id);
        return getSuggestion(ctx.db, id);
      }
      const existing = getSuggestion(ctx.db, input.id);
      if (!existing) throw new CommandError(`no suggestion ${input.id}`);
      addOfferToSuggestion(ctx.db, existing, input.offer_id);
      return getSuggestion(ctx.db, input.id);
    },
  },
};

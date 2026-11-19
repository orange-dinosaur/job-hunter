import { z } from "zod";
import {
  getOffer,
  listOffers,
  setScores,
  upsertOffers,
} from "../../db/offers.ts";
import { getRun, latestRunId } from "../../db/runs.ts";
import { loadProfile } from "../../profile/load.ts";
import { criteria } from "../../profile/schema.ts";
import {
  CommandError,
  intFlag,
  readInput,
  requiredFlag,
  type Command,
} from "../command.ts";
import { profilePath } from "./profile.ts";

const offersInput = z.array(
  z.object({
    source: z.string().min(1),
    url: z.string().nullish(),
    title: z.string().min(1),
    company: z.string().min(1),
    location: z.string().nullish(),
    remote: z.boolean().nullish(),
    salary_text: z.string().nullish(),
    language: z.string().nullish(),
    posted_at: z.string().nullish(),
  }),
);

const scoresInput = z.strictObject({
  scores: z.array(
    z.strictObject({
      criterion: z.enum(criteria),
      score: z.int().min(0).max(100),
      reason: z.string().min(1),
    }),
  ),
  gaps: z.array(z.string().min(1)),
  dealbreaker: z.string().min(1).nullable(),
});

export const offersCommands: Record<string, Command> = {
  "offers:upsert": {
    help: "Insert or merge offers from a run (stdin: array of normalized offers)",
    options: { run: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const runId = intFlag(flags, "run");
      if (!getRun(ctx.db, runId))
        throw new CommandError(`no search run ${runId}`);
      return upsertOffers(ctx.db, readInput(offersInput, stdin), runId);
    },
  },
  "offers:list": {
    help: "List a run's offers, best first (--run latest|<id>, --unscored)",
    options: {
      run: { type: "string", default: "latest" },
      unscored: { type: "boolean", default: false },
    },
    run(ctx, flags) {
      const runId =
        flags.run === "latest" ? latestRunId(ctx.db) : intFlag(flags, "run");
      if (runId == null) return [];
      return listOffers(ctx.db, runId, flags.unscored === true);
    },
  },
  "offers:get": {
    help: "Print one offer with its scores and gaps",
    options: { id: { type: "string" } },
    run(ctx, flags) {
      const id = requiredFlag(flags, "id");
      const offer = getOffer(ctx.db, id);
      if (!offer) throw new CommandError(`no offer ${id}`);
      return offer;
    },
  },
  "scores:set": {
    help: "Store an offer's criterion scores, gaps and dealbreaker (stdin)",
    options: { id: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const id = requiredFlag(flags, "id");
      if (!getOffer(ctx.db, id)) throw new CommandError(`no offer ${id}`);
      const input = readInput(scoresInput, stdin);
      setScores(ctx.db, id, input, loadProfile(profilePath(ctx)).weights);
      const { fit_score, dealbreaker } = getOffer(ctx.db, id)!;
      return { id, fit_score, dealbreaker };
    },
  },
};

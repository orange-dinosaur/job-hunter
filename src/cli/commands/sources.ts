import { findOffer, upsertOffers } from "../../db/offers.ts";
import { getRun } from "../../db/runs.ts";
import { loadProfile } from "../../profile/load.ts";
import {
  normalizeJob,
  runJobspy,
  scriptArgs,
  writeOfferFile,
  type JobspySite,
  type SourceOffer,
} from "../../sources/jobspy.ts";
import {
  CommandError,
  intFlag,
  type Command,
  type Context,
} from "../command.ts";
import { profilePath } from "./profile.ts";

// Upserts the offers of every site and reports sites in the shape run:finish reads.
// A site that returned offers counts as working even if some of its queries failed.
export function storeSites(ctx: Context, runId: number, sites: JobspySite[]) {
  const offers = sites.flatMap((s) =>
    s.offers
      .map((j) => normalizeJob(s.site, j))
      .filter((o): o is SourceOffer => o !== null),
  );
  const result = upsertOffers(ctx.db, offers, runId);
  for (const o of offers)
    writeOfferFile(ctx.dataDir, findOffer(ctx.db, o)!.id, o);
  return {
    sources_ok: sites
      .filter((s) => s.offers.length || !s.error)
      .map((s) => s.site),
    sources_failed: sites
      .filter((s) => !s.offers.length && s.error)
      .map((s) => ({ source: s.site, error: s.error! })),
    sites: sites.map((s) => ({
      site: s.site,
      offers: s.offers.length,
      error: s.error,
    })),
    ...result,
  };
}

export const sourcesCommands: Record<string, Command> = {
  "sources:jobspy": {
    help: "Search Indeed, LinkedIn and Glassdoor with JobSpy and store the offers (--run <id>, --results per query, default 20)",
    options: { run: { type: "string" }, results: { type: "string" } },
    run(ctx, flags) {
      const runId = intFlag(flags, "run");
      if (!getRun(ctx.db, runId))
        throw new CommandError(`no search run ${runId}`);
      const results = flags.results ? intFlag(flags, "results") : 20;
      const profile = loadProfile(profilePath(ctx));
      return storeSites(ctx, runId, runJobspy(scriptArgs(profile, results)));
    },
  },
};

import type { Database } from "bun:sqlite";
import { currentCv } from "../../db/cv.ts";
import { DATA_DIR } from "../../db/migrate.ts";
import {
  followUpDue,
  getOffer,
  listOffers,
  oldPosting,
  setStatus,
} from "../../db/offers.ts";
import { getRun, latestRunId } from "../../db/runs.ts";
import { loadProfile } from "../../profile/load.ts";
import { bandFor } from "../../scoring.ts";
import { join } from "node:path";
import { kitLangs } from "./offer.ts";

export function offersRoutes(db: Database) {
  return {
    "/api/offers": {
      GET() {
        const runId = latestRunId(db);
        const { bands, follow_up_days } = loadProfile(
          join(DATA_DIR, "search-profile.yaml"),
        );
        return Response.json({
          has_cv: currentCv(db, DATA_DIR) !== null,
          run: runId == null ? null : getRun(db, runId),
          offers: (runId == null ? [] : listOffers(db, runId)).map((o) => ({
            ...o,
            kits: kitLangs(DATA_DIR, o.id),
            band: bandFor(o.fit_score, bands),
            follow_up_due: followUpDue(o, follow_up_days),
            old_posting: oldPosting(o.first_seen_at),
          })),
          // Across all runs: an applied offer may not be in the latest search.
          follow_ups_due: listOffers(db, null).filter((o) =>
            followUpDue(o, follow_up_days),
          ).length,
        });
      },
    },
    "/api/offers/:id/discard": {
      POST(req: Bun.BunRequest<"/api/offers/:id/discard">) {
        if (!getOffer(db, req.params.id))
          return Response.json({ error: "no such offer" }, { status: 404 });
        setStatus(db, req.params.id, "discarded");
        return Response.json({ ok: true });
      },
    },
  };
}

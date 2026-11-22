import type { Database } from "bun:sqlite";
import { listOffers, now } from "../../db/offers.ts";
import type { OperationType } from "../../runner/models.ts";
import { runOperation } from "../../runner/run-claude.ts";

export interface SearchOperation {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

const BATCH = "10";

const remaining = (db: Database, before: string) =>
  listOffers(db, null, "scored", { before }).length;

// Runs rescore batches one after another until every offer scored before
// `before` has been scored again. Stops early when a batch saves nothing,
// so a broken run cannot loop forever.
export async function rescoreInBatches(
  db: Database,
  before: string,
  start = runOperation,
) {
  let left = remaining(db, before);
  while (left > 0) {
    await start(db, "rescore", { args: ["--before", before, "--limit", BATCH] })
      .done;
    const next = remaining(db, before);
    if (next >= left) return;
    left = next;
  }
}

export function runsRoutes(db: Database) {
  const latest = (type: OperationType) =>
    db
      .query<SearchOperation, [string]>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = ? ORDER BY id DESC LIMIT 1",
      )
      .get(type);

  // ponytail: kept in memory, so a server restart drops the progress line and
  // stops the chain after the batch in flight.
  let chain: { before: string; total: number } | null = null;

  const rescoreState = () => ({
    count: listOffers(db, null, "scored").length,
    operation: latest("rescore"),
    progress: chain && {
      done: chain.total - remaining(db, chain.before),
      total: chain.total,
    },
  });

  return {
    // The most recent search operation, which the page polls while it runs.
    "/api/search": {
      GET: () => Response.json(latest("search_run")),
      POST() {
        runOperation(db, "search_run");
        return Response.json(latest("search_run"));
      },
    },
    // How many offers a rescore would touch, the latest rescore operation,
    // and how far a rescore of all offers has got.
    "/api/rescore": {
      GET: () => Response.json(rescoreState()),
      POST() {
        if (!chain) {
          const before = now();
          chain = { before, total: remaining(db, before) };
          rescoreInBatches(db, before).finally(() => (chain = null));
        }
        return Response.json(rescoreState());
      },
    },
  };
}

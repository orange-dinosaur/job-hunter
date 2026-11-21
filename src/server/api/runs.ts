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

export function runsRoutes(db: Database) {
  const latest = (type: OperationType) =>
    db
      .query<SearchOperation, [string]>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = ? ORDER BY id DESC LIMIT 1",
      )
      .get(type);
  const rescoreState = () => ({
    count: listOffers(db, null, "scored").length,
    operation: latest("rescore"),
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
    // How many offers a rescore would touch, and the latest rescore operation.
    "/api/rescore": {
      GET: () => Response.json(rescoreState()),
      POST() {
        runOperation(db, "rescore", {
          args: ["--before", now(), "--limit", "10"],
        });
        return Response.json(rescoreState());
      },
    },
  };
}

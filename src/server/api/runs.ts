import type { Database } from "bun:sqlite";
import { runOperation } from "../../runner/run-claude.ts";

export interface SearchOperation {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  started_at: string | null;
  finished_at: string | null;
  error: string | null;
}

export function runsRoutes(db: Database) {
  const latest = () =>
    db
      .query<SearchOperation, []>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = 'search_run' ORDER BY id DESC LIMIT 1",
      )
      .get();

  return {
    // The most recent search operation, which the page polls while it runs.
    "/api/search": {
      GET: () => Response.json(latest()),
      POST() {
        runOperation(db, "search_run");
        return Response.json(latest());
      },
    },
  };
}

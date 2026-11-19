import type { Database } from "bun:sqlite";
import { now } from "./offers.ts";

export interface SourceFailure {
  source: string;
  error: string;
}

export interface SearchRun {
  id: number;
  operation_id: number | null;
  started_at: string;
  finished_at: string | null;
  status: string;
  sources_ok: string[];
  sources_failed: SourceFailure[];
  offers_found: number;
  offers_new: number;
}

export function startRun(db: Database): number {
  return Number(
    db.run("INSERT INTO search_runs DEFAULT VALUES").lastInsertRowid,
  );
}

export function latestRunId(db: Database): number | null {
  const row = db
    .query<{ id: number }, []>("SELECT max(id) AS id FROM search_runs")
    .get();
  return row?.id ?? null;
}

export function getRun(db: Database, id: number): SearchRun | null {
  const row = db
    .query<
      Omit<SearchRun, "sources_ok" | "sources_failed"> & {
        sources_ok: string;
        sources_failed: string;
      },
      [number]
    >("SELECT * FROM search_runs WHERE id = ?")
    .get(id);
  return row
    ? {
        ...row,
        sources_ok: JSON.parse(row.sources_ok),
        sources_failed: JSON.parse(row.sources_failed),
      }
    : null;
}

// A run fails only when no source worked; offer counts come from the offers table.
export function finishRun(
  db: Database,
  id: number,
  sourcesOk: string[],
  sourcesFailed: SourceFailure[],
): void {
  db.query(
    `UPDATE search_runs SET finished_at = $now, status = $status,
       sources_ok = $ok, sources_failed = $failed,
       offers_found = (SELECT count(*) FROM offers WHERE last_seen_run_id = $id),
       offers_new = (SELECT count(*) FROM offers WHERE first_seen_run_id = $id)
     WHERE id = $id`,
  ).run({
    id,
    now: now(),
    status: sourcesOk.length ? "succeeded" : "failed",
    ok: JSON.stringify(sourcesOk),
    failed: JSON.stringify(sourcesFailed),
  });
}

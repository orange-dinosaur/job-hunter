import type { Database } from "bun:sqlite";
import { addUnique } from "./offers.ts";

export type SuggestionStatus = "open" | "accepted" | "dismissed";

export interface CvSuggestion {
  id: number;
  text: string;
  offer_ids: string[];
  count: number;
  status: SuggestionStatus;
  resolved_version_id: number | null;
  created_at: string;
}

type Row = Omit<CvSuggestion, "offer_ids"> & { offer_ids: string };

const parse = (r: Row): CvSuggestion => ({
  ...r,
  offer_ids: JSON.parse(r.offer_ids),
});

export function listSuggestions(
  db: Database,
  status?: SuggestionStatus,
): CvSuggestion[] {
  const rows = status
    ? db
        .query<Row, [string]>(
          "SELECT * FROM cv_suggestions WHERE status = ? ORDER BY count DESC, id",
        )
        .all(status)
    : db
        .query<Row, []>("SELECT * FROM cv_suggestions ORDER BY count DESC, id")
        .all();
  return rows.map(parse);
}

export function getSuggestion(db: Database, id: number): CvSuggestion | null {
  const row = db
    .query<Row, [number]>("SELECT * FROM cv_suggestions WHERE id = ?")
    .get(id);
  return row ? parse(row) : null;
}

export function createSuggestion(
  db: Database,
  text: string,
  offerId: string,
): number {
  return Number(
    db.run("INSERT INTO cv_suggestions (text, offer_ids) VALUES (?, ?)", [
      text,
      JSON.stringify([offerId]),
    ]).lastInsertRowid,
  );
}

// Records that one more offer led to the same suggestion. The count is the number
// of distinct offers, so the same offer twice changes nothing.
export function addOfferToSuggestion(
  db: Database,
  suggestion: CvSuggestion,
  offerId: string,
): void {
  const offerIds = addUnique(suggestion.offer_ids, offerId);
  db.run("UPDATE cv_suggestions SET offer_ids = ?, count = ? WHERE id = ?", [
    JSON.stringify(offerIds),
    offerIds.length,
    suggestion.id,
  ]);
}

// Closes a suggestion. An accepted one points at the CV version it produced.
export function resolveSuggestion(
  db: Database,
  id: number,
  status: Exclude<SuggestionStatus, "open">,
  versionId: number | null,
): void {
  db.run(
    "UPDATE cv_suggestions SET status = ?, resolved_version_id = ? WHERE id = ?",
    [status, versionId, id],
  );
}

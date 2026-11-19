import type { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type CvOrigin = "import" | "suggestion" | "restore";

interface CvVersionRow {
  id: number;
  version: number;
  origin: CvOrigin;
  origin_ref: string | null;
  file_path: string;
  confirmed: number;
  created_at: string;
}

// The newest master CV version, confirmed or not, with its content.
export function currentCv(db: Database, dataDir: string) {
  const row = db
    .query<CvVersionRow, []>(
      "SELECT * FROM cv_versions ORDER BY version DESC LIMIT 1",
    )
    .get();
  if (!row) return null;
  return {
    ...row,
    confirmed: Boolean(row.confirmed),
    cv: JSON.parse(
      readFileSync(join(dataDir, row.file_path), "utf8"),
    ) as unknown,
  };
}

// Writes the CV to data/cv/versions/vNNN.json as a new unconfirmed version.
export function saveCv(
  db: Database,
  dataDir: string,
  cv: unknown,
  origin: CvOrigin,
  originRef: string | null,
) {
  const { next } = db
    .query<{ next: number }, []>(
      "SELECT coalesce(max(version), 0) + 1 AS next FROM cv_versions",
    )
    .get()!;
  const filePath = `cv/versions/v${String(next).padStart(3, "0")}.json`;
  const full = join(dataDir, filePath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(cv, null, 2) + "\n");
  const id = db.run(
    "INSERT INTO cv_versions (version, origin, origin_ref, file_path) VALUES (?, ?, ?, ?)",
    [next, origin, originRef, filePath],
  ).lastInsertRowid;
  return { id: Number(id), version: next, file_path: filePath };
}

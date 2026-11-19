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

export interface CvVersion extends Omit<CvVersionRow, "confirmed"> {
  confirmed: boolean;
}

const toVersion = (row: CvVersionRow): CvVersion => ({
  ...row,
  confirmed: Boolean(row.confirmed),
});

const withContent = (dataDir: string, row: CvVersionRow) => ({
  ...toVersion(row),
  cv: JSON.parse(readFileSync(join(dataDir, row.file_path), "utf8")) as unknown,
});

const versionRow = (db: Database, version: number) =>
  db
    .query<CvVersionRow, [number]>(
      "SELECT * FROM cv_versions WHERE version = ?",
    )
    .get(version);

// The newest master CV version, confirmed or not, with its content.
export function currentCv(db: Database, dataDir: string) {
  const row = db
    .query<CvVersionRow, []>(
      "SELECT * FROM cv_versions ORDER BY version DESC LIMIT 1",
    )
    .get();
  return row ? withContent(dataDir, row) : null;
}

export function getCv(db: Database, dataDir: string, version: number) {
  const row = versionRow(db, version);
  return row ? withContent(dataDir, row) : null;
}

// The newest confirmed version, which a later import is compared against.
export function latestConfirmedCv(db: Database, dataDir: string) {
  const row = db
    .query<CvVersionRow, []>(
      "SELECT * FROM cv_versions WHERE confirmed = 1 ORDER BY version DESC LIMIT 1",
    )
    .get();
  return row ? withContent(dataDir, row) : null;
}

export function listCvVersions(db: Database): CvVersion[] {
  return db
    .query<CvVersionRow, []>("SELECT * FROM cv_versions ORDER BY version DESC")
    .all()
    .map(toVersion);
}

export function confirmCv(db: Database, version: number): void {
  db.run("UPDATE cv_versions SET confirmed = 1 WHERE version = ?", [version]);
}

// Rewrites an unconfirmed version's file. A confirmed version never changes.
export function overwriteDraft(
  db: Database,
  dataDir: string,
  version: number,
  cv: unknown,
): boolean {
  const row = versionRow(db, version);
  if (!row || row.confirmed) return false;
  writeFileSync(
    join(dataDir, row.file_path),
    JSON.stringify(cv, null, 2) + "\n",
  );
  return true;
}

// The original PDF behind a version: its own import, or the import it was restored
// from or built on. Returns a path relative to the data directory.
export function originalPdfFor(db: Database, version: number): string | null {
  let row = versionRow(db, version);
  for (let hops = 0; row && hops < 100; hops++) {
    if (row.origin === "import") return row.origin_ref;
    const restored =
      row.origin === "restore" && /^v(\d+)$/.exec(row.origin_ref ?? "");
    row = versionRow(db, restored ? Number(restored[1]) : row.version - 1);
  }
  return null;
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

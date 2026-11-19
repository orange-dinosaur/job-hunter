import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { migrations } from "./schema.ts";

export const DATA_DIR = join(import.meta.dir, "../../data");
export const DEFAULT_DB_PATH = join(DATA_DIR, "jobs.db");

// Opens the database and brings its schema up to date.
export function openDb(path = DEFAULT_DB_PATH): Database {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { strict: true });
  // The dashboard server and `jh` calls from Claude write at the same time.
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA busy_timeout = 5000");
  db.run("PRAGMA foreign_keys = ON");
  migrate(db);
  return db;
}

export function migrate(db: Database): void {
  const { user_version } = db.query("PRAGMA user_version").get() as {
    user_version: number;
  };
  for (let v = user_version; v < migrations.length; v++) {
    db.transaction(() => {
      db.run(migrations[v]!);
      db.run(`PRAGMA user_version = ${v + 1}`);
    })();
  }
}

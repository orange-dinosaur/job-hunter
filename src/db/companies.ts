import type { Database } from "bun:sqlite";
import { companyKey, now } from "./offers.ts";

export const sectors = [
  "it_software",
  "manufacturing",
  "consulting",
  "public_administration",
  "banking_insurance",
  "utilities_energy",
  "retail_consumer",
  "healthcare",
  "logistics",
  "other",
] as const;
export const sizes = ["startup", "sme", "large", "unknown"] as const;
export const kinds = [
  "end_client",
  "it_consultancy",
  "staffing_agency",
  "public_body",
  "unknown",
] as const;

export interface CompanyFields {
  sector: (typeof sectors)[number];
  size: (typeof sizes)[number];
  kind: (typeof kinds)[number];
}

// Records what the scoring call inferred about an offer's company. A known
// size or kind is never replaced by unknown, and name, origin and watched stay
// as first stored.
export function upsertCompanyFromOffer(
  db: Database,
  name: string,
  fields: CompanyFields,
): void {
  db.run(
    `INSERT INTO companies (key, name, sector, size, kind, origin, updated_at)
     VALUES (?, ?, ?, ?, ?, 'offer', ?)
     ON CONFLICT (key) DO UPDATE SET
       sector = excluded.sector,
       size = CASE WHEN excluded.size = 'unknown' THEN coalesce(size, 'unknown') ELSE excluded.size END,
       kind = CASE WHEN excluded.kind = 'unknown' THEN coalesce(kind, 'unknown') ELSE excluded.kind END,
       updated_at = excluded.updated_at`,
    [companyKey(name), name, fields.sector, fields.size, fields.kind, now()],
  );
}

export function getCompany(db: Database, name: string) {
  return db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM companies WHERE key = ?",
    )
    .get(companyKey(name));
}

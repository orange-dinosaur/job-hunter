import type { Database } from "bun:sqlite";
import { companyKey, firstSeenAt, now } from "./offers.ts";
import { latestRunId } from "./runs.ts";

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

export interface SearchedCompany extends CompanyFields {
  name: string;
  town: string | null;
  website: string | null;
  careers_url: string | null;
  reason: string;
}

// Saves a company found by company search. A company already known keeps its
// name, origin, watched and sector; a known size or kind is never replaced by
// unknown; the search fills in town, links and reason. Returns true if new.
export function upsertCompanyFromSearch(
  db: Database,
  c: SearchedCompany,
): boolean {
  const key = companyKey(c.name);
  const existed = db.query("SELECT 1 FROM companies WHERE key = ?").get(key);
  db.run(
    `INSERT INTO companies (key, name, sector, size, kind, town, website, careers_url, reason, origin, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'search', ?)
     ON CONFLICT (key) DO UPDATE SET
       sector = coalesce(sector, excluded.sector),
       size = CASE WHEN excluded.size = 'unknown' THEN coalesce(size, 'unknown') ELSE excluded.size END,
       kind = CASE WHEN excluded.kind = 'unknown' THEN coalesce(kind, 'unknown') ELSE excluded.kind END,
       town = coalesce(excluded.town, town),
       website = coalesce(excluded.website, website),
       careers_url = coalesce(excluded.careers_url, careers_url),
       reason = excluded.reason,
       updated_at = excluded.updated_at`,
    [
      key,
      c.name,
      c.sector,
      c.size,
      c.kind,
      c.town,
      c.website,
      c.careers_url,
      c.reason,
      now(),
    ],
  );
  return !existed;
}

export interface CompanyFilters {
  sector?: string;
  size?: string;
  kind?: string;
  // Matched, ignoring case, against the company's town and its offers' locations.
  location?: string;
}

interface CompanyRow extends CompanyFields {
  key: string;
  name: string;
  town: string | null;
  website: string | null;
  careers_url: string | null;
  origin: "offer" | "search";
  watched: number;
}

interface CompanyOfferRow {
  id: string;
  title: string;
  company: string;
  locations: string;
  fit_score: number | null;
  posted_at: string | null;
  first_seen_at: string;
  first_seen_run_id: number | null;
}

// Companies with their non-discarded offers, best fit first. Offers link to a
// company by `companyKey` of their company name.
export function listCompanies(db: Database, filters: CompanyFilters = {}) {
  const latest = latestRunId(db);
  const byKey = new Map<string, CompanyOfferRow[]>();
  for (const o of db
    .query<CompanyOfferRow, []>(
      `SELECT id, title, company, locations, fit_score, posted_at, first_seen_run_id,
         ${firstSeenAt} AS first_seen_at
       FROM offers WHERE status != 'discarded' ORDER BY fit_score DESC NULLS LAST`,
    )
    .all()) {
    const key = companyKey(o.company);
    byKey.set(key, [...(byKey.get(key) ?? []), o]);
  }

  const where = (["sector", "size", "kind"] as const).filter((f) => filters[f]);
  const rows = db
    .query<CompanyRow, string[]>(
      `SELECT key, name, sector, size, kind, town, website, careers_url, origin, watched
       FROM companies ${where.length ? "WHERE " + where.map((f) => `${f} = ?`).join(" AND ") : ""}`,
    )
    .all(...where.map((f) => filters[f]!));

  const place = filters.location?.trim().toLowerCase();
  return rows
    .map((c) => {
      const offers = byKey.get(c.key) ?? [];
      const posted = offers.map((o) => o.posted_at ?? o.first_seen_at).sort();
      return {
        ...c,
        watched: c.watched === 1,
        offers: offers.map((o) => ({
          id: o.id,
          title: o.title,
          fit_score: o.fit_score,
          locations: JSON.parse(o.locations) as string[],
        })),
        best_fit_score: offers[0]?.fit_score ?? null,
        last_posted: posted.at(-1) ?? null,
        new_offer:
          latest != null && offers.some((o) => o.first_seen_run_id === latest),
      };
    })
    .filter(
      (c) =>
        !place ||
        c.town?.toLowerCase().includes(place) ||
        c.offers.some((o) =>
          o.locations.some((l) => l.toLowerCase().includes(place)),
        ),
    )
    .sort(
      (a, b) =>
        (b.best_fit_score ?? -1) - (a.best_fit_score ?? -1) ||
        a.name.localeCompare(b.name),
    );
}

export type CompanySummary = ReturnType<typeof listCompanies>[number];

// Flips the star. Returns the new state, or null when there is no such company.
export function toggleWatched(db: Database, key: string): boolean | null {
  const row = db
    .query<{ watched: number }, [string]>(
      "UPDATE companies SET watched = 1 - watched WHERE key = ? RETURNING watched",
    )
    .get(key);
  return row ? row.watched === 1 : null;
}

export function getCompany(db: Database, name: string) {
  return db
    .query<Record<string, unknown>, [string]>(
      "SELECT * FROM companies WHERE key = ?",
    )
    .get(companyKey(name));
}

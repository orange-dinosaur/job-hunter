import type { Database } from "bun:sqlite";
import { fitScore, type CriterionScore } from "../scoring.ts";

export const offerStatuses = [
  "new",
  "shortlisted",
  "prepared",
  "applied",
  "interview",
  "offer_received",
  "rejected",
  "discarded",
] as const;
export type OfferStatus = (typeof offerStatuses)[number];

// One offer as a source returns it, already normalized.
export interface OfferInput {
  source: string;
  url?: string | null;
  title: string;
  company: string;
  location?: string | null;
  remote?: boolean | null;
  salary_text?: string | null;
  language?: string | null;
  posted_at?: string | null;
}

export interface Offer {
  id: string;
  dedupe_key: string;
  url: string | null;
  sources: string[];
  title: string;
  company: string;
  locations: string[];
  remote: boolean | null;
  salary_text: string | null;
  language: string | null;
  posted_at: string | null;
  first_seen_run_id: number | null;
  last_seen_run_id: number | null;
  status: OfferStatus;
  status_note: string | null;
  fit_score: number | null;
  dealbreaker: string | null;
  scored_at: string | null;
  followed_up_at: string | null;
  // When the offer last moved to `applied`, from the status history.
  applied_at: string | null;
  // How many search runs have returned this offer.
  seen_runs: number;
  // When the run that first found it started, or when it was added.
  first_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface ScoredCriterion extends CriterionScore {
  reason: string;
}

export interface OfferScoring {
  scores: ScoredCriterion[];
  gaps: string[];
  dealbreaker: string | null;
}

const LEGAL_SUFFIXES = new Set([
  "srl",
  "srls",
  "spa",
  "sas",
  "snc",
  "sapa",
  "scarl",
  "scrl",
  "coop",
  "ltd",
  "limited",
  "llc",
  "inc",
  "corp",
  "plc",
  "gmbh",
  "ag",
  "bv",
  "sa",
  "sarl",
]);

function normalize(text: string): string[] {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\./g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}

export function companyKey(name: string): string {
  const words = normalize(name);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1)!)) words.pop();
  return words.join(" ");
}

export function dedupeKey(company: string, title: string): string {
  return `${companyKey(company)}|${normalize(title).join(" ")}`;
}

export const now = () => new Date().toISOString().slice(0, 19) + "Z";

export const addUnique = (list: string[], item: string | null | undefined) =>
  item && !list.includes(item) ? [...list, item] : list;

// The stored offer an input matches, by dedupe key or by URL.
export function findOffer(db: Database, input: OfferInput) {
  return db
    .query<
      { id: string; sources: string; locations: string },
      [string, string | null]
    >(
      "SELECT id, sources, locations FROM offers WHERE dedupe_key = ? OR url = ?",
    )
    .get(dedupeKey(input.company, input.title), input.url ?? null);
}

// Inserts new offers and merges repeats into the offer already stored.
// A merge never touches status, so a discarded offer stays discarded.
export function upsertOffers(
  db: Database,
  inputs: OfferInput[],
  runId: number | null,
): { new: string[]; updated: string[] } {
  const insert = db.query(
    `INSERT INTO offers (id, dedupe_key, url, sources, title, company, locations, remote,
       salary_text, language, posted_at, first_seen_run_id, last_seen_run_id)
     VALUES ($id, $key, $url, $sources, $title, $company, $locations, $remote,
       $salary_text, $language, $posted_at, $run, $run)`,
  );
  const merge = db.query(
    `UPDATE offers SET sources = $sources, locations = $locations,
       seen_runs = seen_runs + ($run IS NOT NULL AND last_seen_run_id IS NOT $run),
       last_seen_run_id = $run,
       url = coalesce(url, $url), remote = coalesce(remote, $remote),
       salary_text = coalesce(salary_text, $salary_text), language = coalesce(language, $language),
       posted_at = coalesce(posted_at, $posted_at), updated_at = $now
     WHERE id = $id`,
  );

  const result = { new: [] as string[], updated: [] as string[] };
  db.transaction(() => {
    for (const o of inputs) {
      const key = dedupeKey(o.company, o.title);
      const fields = {
        url: o.url ?? null,
        remote: o.remote == null ? null : Number(o.remote),
        salary_text: o.salary_text ?? null,
        language: o.language ?? null,
        posted_at: o.posted_at ?? null,
        run: runId,
      };
      const existing = findOffer(db, o);
      if (existing) {
        merge.run({
          ...fields,
          id: existing.id,
          sources: JSON.stringify(
            addUnique(JSON.parse(existing.sources), o.source),
          ),
          locations: JSON.stringify(
            addUnique(JSON.parse(existing.locations), o.location),
          ),
          now: now(),
        });
        if (
          !result.new.includes(existing.id) &&
          !result.updated.includes(existing.id)
        )
          result.updated.push(existing.id);
      } else {
        const id = crypto.randomUUID().slice(0, 8);
        insert.run({
          ...fields,
          id,
          key,
          title: o.title,
          company: o.company,
          sources: JSON.stringify([o.source]),
          locations: JSON.stringify(addUnique([], o.location)),
        });
        result.new.push(id);
      }
    }
  })();
  return result;
}

type OfferRow = Omit<Offer, "sources" | "locations" | "remote"> & {
  sources: string;
  locations: string;
  remote: number | null;
};

export function getOffer(
  db: Database,
  id: string,
): (Offer & { scores: ScoredCriterion[]; gaps: string[] }) | null {
  const row = db
    .query<OfferRow, [string]>(
      `SELECT *, ${appliedAt} AS applied_at, ${firstSeenAt} AS first_seen_at
       FROM offers WHERE id = ?`,
    )
    .get(id);
  if (!row) return null;
  const scores = db
    .query<ScoredCriterion, [string]>(
      "SELECT criterion, score, reason FROM offer_scores WHERE offer_id = ? ORDER BY criterion",
    )
    .all(id);
  const gaps = db
    .query<{ text: string }, [string]>(
      "SELECT text FROM offer_gaps WHERE offer_id = ? ORDER BY rowid",
    )
    .all(id)
    .map((g) => g.text);
  return {
    ...row,
    sources: JSON.parse(row.sources),
    locations: JSON.parse(row.locations),
    remote: row.remote == null ? null : Boolean(row.remote),
    scores,
    gaps,
  };
}

// Replaces the offer's scores and gaps and stores the fit score computed from them.
export function setScores(
  db: Database,
  id: string,
  scoring: OfferScoring,
  weights: Record<string, number>,
): void {
  db.transaction(() => {
    db.run("DELETE FROM offer_scores WHERE offer_id = ?", [id]);
    db.run("DELETE FROM offer_gaps WHERE offer_id = ?", [id]);
    const score = db.query("INSERT INTO offer_scores VALUES (?, ?, ?, ?)");
    for (const s of scoring.scores)
      score.run(id, s.criterion, s.score, s.reason);
    const gap = db.query("INSERT INTO offer_gaps VALUES (?, ?)");
    for (const g of scoring.gaps) gap.run(id, g);
    db.run(
      "UPDATE offers SET fit_score = ?, dealbreaker = ?, scored_at = ?, updated_at = ? WHERE id = ?",
      [
        fitScore(scoring.scores, weights),
        scoring.dealbreaker,
        now(),
        now(),
        id,
      ],
    );
  })();
}

// Recomputes every stored fit score from its criterion scores, for new weights.
// Offers with a dealbreaker keep a null score. Returns how many were refitted.
export function refitScores(
  db: Database,
  weights: Record<string, number>,
): number {
  return db.transaction(() => {
    const rows = db
      .query<{ offer_id: string; criterion: string; score: number }, []>(
        `SELECT s.offer_id, s.criterion, s.score FROM offer_scores s
         JOIN offers o ON o.id = s.offer_id WHERE o.dealbreaker IS NULL`,
      )
      .all();
    const byOffer = Map.groupBy(rows, (r) => r.offer_id);
    const update = db.query("UPDATE offers SET fit_score = ? WHERE id = ?");
    for (const [id, scores] of byOffer)
      update.run(fitScore(scores, weights), id);
    return byOffer.size;
  })();
}

export function setStatus(
  db: Database,
  id: string,
  status: OfferStatus,
  note: string | null = null,
): void {
  db.run(
    "UPDATE offers SET status = ?, status_note = ?, updated_at = ? WHERE id = ?",
    [status, note, now(), id],
  );
}

export function markFollowedUp(db: Database, id: string): void {
  db.run("UPDATE offers SET followed_up_at = ? WHERE id = ?", [now(), id]);
}

const DAY_MS = 86_400_000;
const daysSince = (iso: string, at: Date) =>
  (at.getTime() - Date.parse(iso)) / DAY_MS;

// An applied offer is due a first follow-up `first` days after applying, and a
// second one `second` days after applying once the first is `first` days old.
// A follow-up made on or after day `second` counts as the second, so nothing
// comes due after it.
export function followUpDue(
  offer: Pick<Offer, "status" | "applied_at" | "followed_up_at">,
  [first, second]: [number, number],
  at = new Date(),
): boolean {
  if (offer.status !== "applied" || !offer.applied_at) return false;
  const applied = daysSince(offer.applied_at, at);
  if (!offer.followed_up_at) return applied >= first;
  const sinceFollowUp = daysSince(offer.followed_up_at, at);
  const followUpDay = applied - sinceFollowUp;
  return applied >= second && sinceFollowUp >= first && followUpDay < second;
}

export const oldPosting = (firstSeenAt: string, at = new Date()) =>
  daysSince(firstSeenAt, at) > 30;

// Creating a kit moves an offer forward to `prepared`, never back.
export function markPrepared(db: Database, id: string): void {
  db.run(
    "UPDATE offers SET status = 'prepared', updated_at = ? WHERE id = ? AND status IN ('new', 'shortlisted')",
    [now(), id],
  );
}

export interface OfferSummary {
  id: string;
  title: string;
  company: string;
  locations: string[];
  sources: string[];
  status: OfferStatus;
  fit_score: number | null;
  dealbreaker: string | null;
  gap_count: number;
  applied_at: string | null;
  followed_up_at: string | null;
  first_seen_at: string;
}

const appliedAt =
  "(SELECT max(h.at) FROM status_history h WHERE h.offer_id = offers.id AND h.status = 'applied')";
export const firstSeenAt =
  "coalesce((SELECT r.started_at FROM search_runs r WHERE r.id = offers.first_seen_run_id), created_at)";
const hasScores =
  "EXISTS (SELECT 1 FROM offer_scores s WHERE s.offer_id = offers.id)";
const scoreFilters = {
  unscored: `AND dealbreaker IS NULL AND NOT ${hasScores}`,
  scored: `AND (dealbreaker IS NOT NULL OR ${hasScores})`,
};

// Offers seen in a run (or in any run when runId is null), best first.
// Discarded offers are left out. `before` keeps offers not scored since then,
// so a rescore in batches can tell which offers it has done.
export function listOffers(
  db: Database,
  runId: number | null,
  filter?: keyof typeof scoreFilters,
  opts: { before?: string; limit?: number } = {},
): OfferSummary[] {
  return db
    .query<
      Omit<OfferSummary, "locations" | "sources"> & {
        locations: string;
        sources: string;
      },
      [number | null, string | null, number]
    >(
      `SELECT id, title, company, locations, sources, status, fit_score, dealbreaker,
         followed_up_at, ${appliedAt} AS applied_at, ${firstSeenAt} AS first_seen_at,
         (SELECT count(*) FROM offer_gaps g WHERE g.offer_id = offers.id) AS gap_count
       FROM offers WHERE (?1 IS NULL OR last_seen_run_id = ?1) AND status != 'discarded'
         AND (?2 IS NULL OR scored_at IS NULL OR scored_at < ?2)
         ${filter ? scoreFilters[filter] : ""}
       ORDER BY fit_score DESC NULLS LAST, created_at
       LIMIT ?3`,
    )
    .all(runId, opts.before ?? null, opts.limit ?? -1)
    .map((o) => ({
      ...o,
      locations: JSON.parse(o.locations),
      sources: JSON.parse(o.sources),
    }));
}

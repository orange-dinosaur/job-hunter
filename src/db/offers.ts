import type { Database } from "bun:sqlite";
import { fitScore, type CriterionScore } from "../scoring.ts";

export type OfferStatus =
  | "new"
  | "shortlisted"
  | "prepared"
  | "applied"
  | "interview"
  | "offer_received"
  | "rejected"
  | "discarded";

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

export function dedupeKey(company: string, title: string): string {
  const words = normalize(company);
  while (words.length > 1 && LEGAL_SUFFIXES.has(words.at(-1)!)) words.pop();
  return `${words.join(" ")}|${normalize(title).join(" ")}`;
}

const now = () => new Date().toISOString().slice(0, 19) + "Z";

const addUnique = (list: string[], item: string | null | undefined) =>
  item && !list.includes(item) ? [...list, item] : list;

// Inserts new offers and merges repeats into the offer already stored.
// A merge never touches status, so a discarded offer stays discarded.
export function upsertOffers(
  db: Database,
  inputs: OfferInput[],
  runId: number | null,
): { new: string[]; updated: string[] } {
  const found = db.query<
    { id: string; sources: string; locations: string },
    [string, string | null]
  >(
    "SELECT id, sources, locations FROM offers WHERE dedupe_key = ? OR url = ?",
  );
  const insert = db.query(
    `INSERT INTO offers (id, dedupe_key, url, sources, title, company, locations, remote,
       salary_text, language, posted_at, first_seen_run_id, last_seen_run_id)
     VALUES ($id, $key, $url, $sources, $title, $company, $locations, $remote,
       $salary_text, $language, $posted_at, $run, $run)`,
  );
  const merge = db.query(
    `UPDATE offers SET sources = $sources, locations = $locations, last_seen_run_id = $run,
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
      const existing = found.get(key, fields.url);
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
    .query<OfferRow, [string]>("SELECT * FROM offers WHERE id = ?")
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
      "UPDATE offers SET fit_score = ?, dealbreaker = ?, updated_at = ? WHERE id = ?",
      [fitScore(scoring.scores, weights), scoring.dealbreaker, now(), id],
    );
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

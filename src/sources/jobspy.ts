import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { OfferInput } from "../db/offers.ts";
import type { SearchProfile } from "../profile/schema.ts";

const SCRIPT = join(import.meta.dir, "../../scripts/jobspy_search.py");

const str = z.string().nullable();
const num = z.number().nullable();

const jobSchema = z.object({
  title: str,
  company: str,
  location: str,
  job_url: str,
  is_remote: z.boolean().nullable(),
  min_amount: num,
  max_amount: num,
  currency: str,
  interval: str,
  date_posted: str,
  description: str,
});

export const sitesSchema = z.array(
  z.object({
    site: z.string(),
    offers: z.array(jobSchema),
    error: str,
  }),
);

export type JobspyJob = z.infer<typeof jobSchema>;
export type JobspySite = z.infer<typeof sitesSchema>[number];
export type SourceOffer = OfferInput & { description: string | null };

export function scriptArgs(profile: SearchProfile, results: number): string[] {
  return [
    ...profile.roles.flatMap((r) => ["--term", r]),
    ...profile.locations.flatMap((l) =>
      l === "remote" ? ["--remote"] : ["--place", `${l.place}:${l.radius_km}`],
    ),
    "--results",
    String(results),
  ];
}

export function runJobspy(args: string[]): JobspySite[] {
  const proc = Bun.spawnSync(["uv", "run", "--script", SCRIPT, ...args]);
  if (proc.exitCode !== 0) {
    const stderr = proc.stderr.toString().trim().split("\n").slice(-5);
    throw new Error(`jobspy script failed:\n${stderr.join("\n")}`);
  }
  return sitesSchema.parse(JSON.parse(proc.stdout.toString()));
}

export function salaryText(job: JobspyJob): string | null {
  const { min_amount: min, max_amount: max } = job;
  const f = (n: number) => String(Math.round(n));
  let range: string;
  if (min != null && max != null)
    range = min === max ? f(min) : `${f(min)}-${f(max)}`;
  else if (min != null) range = `from ${f(min)}`;
  else if (max != null) range = `up to ${f(max)}`;
  else return null;
  return [job.currency, range, job.interval].filter(Boolean).join(" ");
}

// Returns null for a job without a title or company, which cannot be deduplicated.
export function normalizeJob(site: string, job: JobspyJob): SourceOffer | null {
  if (!job.title?.trim() || !job.company?.trim()) return null;
  return {
    source: site,
    url: job.job_url,
    title: job.title.trim(),
    company: job.company.trim(),
    location: job.location,
    // JobSpy reports false when it found no remote marker, which does not mean on-site.
    remote: job.is_remote ? true : null,
    salary_text: salaryText(job),
    language: null,
    posted_at: job.date_posted,
    description: job.description?.trim() || null,
  };
}

const NO_DESCRIPTION = "No description from the source.";

// Writes offer.md once. A later run may replace it only to add a missing description.
export function writeOfferFile(
  dataDir: string,
  id: string,
  offer: SourceOffer,
): void {
  const dir = join(dataDir, "offers", id);
  const path = join(dir, "offer.md");
  if (
    existsSync(path) &&
    !(offer.description && readFileSync(path, "utf8").includes(NO_DESCRIPTION))
  )
    return;
  mkdirSync(dir, { recursive: true });
  const lines = [
    `# ${offer.title}`,
    "",
    [offer.company, offer.location].filter(Boolean).join(", "),
    `Source: ${offer.source}${offer.url ? ` ${offer.url}` : ""}`,
    ...(offer.posted_at ? [`Posted: ${offer.posted_at}`] : []),
    "",
    offer.description ?? NO_DESCRIPTION,
    "",
  ];
  writeFileSync(path, lines.join("\n"));
}

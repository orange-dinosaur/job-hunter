import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeSites } from "../cli/commands/sources.ts";
import { openDb } from "../db/migrate.ts";
import { getOffer } from "../db/offers.ts";
import { loadProfile, EXAMPLE_PATH } from "../profile/load.ts";
import fixture from "./fixtures/jobspy-bologna.json";
import { normalizeJob, scriptArgs, sitesSchema } from "./jobspy.ts";

// Recorded from a live run: Indeed and Glassdoor answered, LinkedIn returned HTTP 429.
const sites = sitesSchema.parse(fixture);
const dirs: string[] = [];

function setup() {
  const dataDir = mkdtempSync(join(tmpdir(), "jh-jobspy-"));
  dirs.push(dataDir);
  const db = openDb(":memory:");
  const run = Number(
    db.run("INSERT INTO search_runs DEFAULT VALUES").lastInsertRowid,
  );
  return { ctx: { db, dataDir }, run };
}

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

test("script arguments come from the search profile", () => {
  expect(scriptArgs(loadProfile(EXAMPLE_PATH), 5)).toEqual([
    "--term",
    "Software developer",
    "--term",
    "Backend developer",
    "--place",
    "Bologna:30",
    "--remote",
    "--results",
    "5",
  ]);
});

test("normalizer maps JobSpy fields to the offer shape", () => {
  const [l3harris, , coesia] = sites[0]!.offers.map((j) =>
    normalizeJob("indeed", j),
  );
  expect(l3harris).toMatchObject({
    source: "indeed",
    title: "Software Engineer",
    company: "L3Harris",
    location: "Bologna, EMI, Italy",
    remote: null,
    salary_text: "EUR 30000-40000 yearly",
    posted_at: "2026-11-12",
  });
  expect(l3harris!.url).toStartWith("https://it.indeed.com/");
  expect(l3harris!.description).toStartWith("L3Harris");
  expect(coesia).toMatchObject({
    salary_text: "EUR from 40500 yearly",
    description: null,
  });
  const glassdoor = normalizeJob("glassdoor", sites[2]!.offers[0]!);
  expect(glassdoor).toMatchObject({ salary_text: null, remote: null });
});

test("normalizer drops jobs without a company", () => {
  const job = { ...sites[0]!.offers[0]!, company: " " };
  expect(normalizeJob("indeed", job)).toBeNull();
});

test("storing a run upserts offers, reports sites and writes offer files", () => {
  const { ctx, run } = setup();
  const out = storeSites(ctx, run, sites);
  // Glassdoor lists the same NonStop Consulting job twice.
  expect(out.new).toHaveLength(5);
  expect(out.sources_ok).toEqual(["indeed", "glassdoor"]);
  expect(out.sources_failed).toEqual([
    { source: "linkedin", error: sites[1]!.error! },
  ]);

  const coesiaId = out.new.find(
    (id) => getOffer(ctx.db, id)!.company === "Coesia",
  )!;
  const path = join(ctx.dataDir, "offers", coesiaId, "offer.md");
  expect(readFileSync(path, "utf8")).toContain(
    "No description from the source.",
  );

  // A later run that has the description fills it in.
  const withText = structuredClone(sites);
  withText[0]!.offers[2]!.description = "Full text";
  storeSites(ctx, run, withText);
  expect(readFileSync(path, "utf8")).toContain("Full text");
});

test("a site with offers counts as working even with an error", () => {
  const { ctx, run } = setup();
  const partial = [{ ...sites[0]!, error: "Backend developer in Italy: 429" }];
  expect(storeSites(ctx, run, partial)).toMatchObject({
    sources_ok: ["indeed"],
    sources_failed: [],
  });
});

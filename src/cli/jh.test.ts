import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/migrate.ts";
import { setStatus } from "../db/offers.ts";
import { sampleCv } from "../cv/sample-cv.ts";
import type { Context } from "./command.ts";
import { commands, helpText, runCommand } from "./jh.ts";

let ctx: Context;

beforeEach(() => {
  const dataDir = mkdtempSync(join(tmpdir(), "jh-cli-"));
  ctx = { db: openDb(join(dataDir, "jobs.db")), dataDir };
});

afterEach(() => {
  ctx.db.close();
  rmSync(ctx.dataDir, { recursive: true, force: true });
});

// Runs `jh <line>` with an optional stdin value, sent as JSON.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const jh = (line: string, input?: unknown): any =>
  runCommand(
    ctx,
    line.split(" "),
    input === undefined ? "" : JSON.stringify(input),
  );

function seedOffer(): { run: number; id: string } {
  const { id: run } = jh("run:start");
  const { new: ids } = jh(`offers:upsert --run ${run}`, [
    { source: "indeed", title: "Dev", company: "Acme", location: "Bologna" },
  ]);
  return { run, id: ids[0] };
}

const scoring = {
  scores: [
    { criterion: "skills", score: 80, reason: "TypeScript" },
    { criterion: "location", score: 40, reason: "far" },
  ],
  gaps: ["Kubernetes"],
  dealbreaker: null,
};

test("help lists every command", () => {
  const help = helpText();
  for (const name of Object.keys(commands)) expect(help).toContain(name);
  expect(() => jh("nope")).toThrow("unknown command: nope");
});

test("profile:show copies the example once and says so", () => {
  expect(jh("profile:show").note).toContain("Copied the example");
  const second = jh("profile:show");
  expect(second.note).toBeUndefined();
  expect(second.profile.weights.skills).toBe(25);
});

test("profile:check passes a valid profile and names the broken field", () => {
  jh("profile:show");
  expect(jh("profile:check")).toEqual({ ok: true });
  const path = join(ctx.dataDir, "search-profile.yaml");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace("salary: 0", "salary: 1"),
  );
  expect(() => jh("profile:check")).toThrow(
    "weights: must sum to 100, got 101",
  );
});

test("run:start and run:finish record sources and counts", () => {
  const { run } = seedOffer();
  const finished = jh(`run:finish --id ${run}`, {
    sources_ok: ["indeed"],
    sources_failed: [{ source: "linkedin", error: "HTTP 429" }],
  });
  expect(finished).toMatchObject({
    status: "succeeded",
    sources_ok: ["indeed"],
    sources_failed: [{ source: "linkedin", error: "HTTP 429" }],
    offers_found: 1,
    offers_new: 1,
  });
  expect(finished.finished_at).toBeString();
  const { id: empty } = jh("run:start");
  expect(
    jh(`run:finish --id ${empty}`, { sources_ok: [], sources_failed: [] })
      .status,
  ).toBe("failed");
  expect(() =>
    jh("run:finish --id 999", { sources_ok: [], sources_failed: [] }),
  ).toThrow("no search run 999");
});

test("offers:upsert reports new and updated ids and checks its input", () => {
  const { run, id } = seedOffer();
  expect(
    jh(`offers:upsert --run ${run}`, [
      { source: "linkedin", title: "Dev", company: "Acme SRL" },
    ]),
  ).toEqual({ new: [], updated: [id] });
  expect(() =>
    jh(`offers:upsert --run ${run}`, [{ source: "x", title: "Dev" }]),
  ).toThrow("0.company");
  expect(() =>
    runCommand(ctx, ["offers:upsert", "--run", String(run)], "not json"),
  ).toThrow("stdin is not valid JSON");
});

test("offers:list shows the latest run and filters unscored and discarded offers", () => {
  jh("profile:show");
  const { id } = seedOffer();
  const {
    new: [other],
  } = jh("offers:upsert --run 1", [
    { source: "indeed", title: "Ops", company: "Beta" },
  ]);
  expect(
    jh("offers:list --run latest --unscored").map((o: { id: string }) => o.id),
  ).toEqual([id, other]);
  jh(`scores:set --id ${id}`, scoring);
  setStatus(ctx.db, other, "discarded");
  expect(jh("offers:list --unscored")).toEqual([]);
  expect(jh("offers:list --run 1")).toEqual([
    expect.objectContaining({
      id,
      fit_score: 62,
      locations: ["Bologna"],
      gap_count: 1,
    }),
  ]);
});

test("offers:get returns scores and gaps", () => {
  jh("profile:show");
  const { id } = seedOffer();
  jh(`scores:set --id ${id}`, scoring);
  expect(jh(`offers:get --id ${id}`)).toMatchObject({
    title: "Dev",
    gaps: ["Kubernetes"],
    scores: [{ criterion: "location" }, { criterion: "skills" }],
  });
  expect(() => jh("offers:get --id missing")).toThrow("no offer missing");
});

test("scores:set uses the profile weights and rejects unknown criteria", () => {
  jh("profile:show");
  const { id } = seedOffer();
  // (80*25 + 40*20) / 45 = 62.2
  expect(jh(`scores:set --id ${id}`, scoring)).toEqual({
    id,
    fit_score: 62,
    dealbreaker: null,
  });
  expect(() =>
    jh(`scores:set --id ${id}`, {
      ...scoring,
      scores: [{ criterion: "vibes", score: 1, reason: "x" }],
    }),
  ).toThrow("scores.0.criterion");
});

test("cv:save numbers versions and cv:current returns the newest", () => {
  expect(jh("cv:current")).toBeNull();
  jh("cv:save --origin import --ref original.pdf", sampleCv);
  const second = { ...sampleCv, headline: "Seconda versione" };
  expect(jh("cv:save --origin restore --ref v001", second)).toMatchObject({
    version: 2,
    file_path: "cv/versions/v002.json",
  });
  expect(jh("cv:current")).toMatchObject({
    version: 2,
    origin: "restore",
    confirmed: false,
    cv: second,
  });
  expect(() => jh("cv:save --origin magic", sampleCv)).toThrow(
    "--origin must be one of",
  );
  expect(() =>
    jh("cv:save --origin import", { ...sampleCv, headline: "" }),
  ).toThrow("headline");
});

test("cv:save from a suggestion needs an open one and accepts it", () => {
  const { id: offerId } = seedOffer();
  const { id } = jh("suggestions:add", { text: "Add ERP", offer_id: offerId });
  expect(() => jh("cv:save --origin suggestion", sampleCv)).toThrow("s<id>");
  expect(() => jh("cv:save --origin suggestion --ref s99", sampleCv)).toThrow(
    "s<id>",
  );

  const saved = jh(`cv:save --origin suggestion --ref s${id}`, sampleCv);
  expect(jh("suggestions:list --status accepted")).toMatchObject([
    { id, resolved_version_id: saved.id },
  ]);
  expect(() =>
    jh(`cv:save --origin suggestion --ref s${id}`, sampleCv),
  ).toThrow("open suggestion");
});

test("cv:original copies a PDF into data/cv/originals and refuses other files", () => {
  const pdf = join(ctx.dataDir, "my cv.pdf");
  writeFileSync(pdf, "%PDF-1.7");
  const { path, ref } = runCommand(ctx, ["cv:original", "--file", pdf]) as {
    path: string;
    ref: string;
  };
  expect(ref).toMatch(/^cv\/originals\/\d{8}-\d{6}-my cv\.pdf$/);
  expect(readFileSync(path, "utf8")).toBe("%PDF-1.7");
  expect(() => jh("cv:original --file cv.docx")).toThrow("only PDF files");
  expect(() => jh("cv:original --file missing.pdf")).toThrow("no file at");
});

test("suggestions:add creates, then counts each offer once", () => {
  const { run, id } = seedOffer();
  const {
    new: [other],
  } = jh(`offers:upsert --run ${run}`, [
    { source: "indeed", title: "Ops", company: "Beta" },
  ]);
  const created = jh("suggestions:add", {
    text: "Mention Docker",
    offer_id: id,
  });
  expect(created).toMatchObject({ count: 1, offer_ids: [id], status: "open" });
  jh("suggestions:add", { id: created.id, offer_id: other });
  jh("suggestions:add", { id: created.id, offer_id: other });
  expect(jh("suggestions:list --status open")).toEqual([
    expect.objectContaining({ count: 2, offer_ids: [id, other] }),
  ]);
  expect(jh("suggestions:list --status accepted")).toEqual([]);
  expect(() => jh("suggestions:add", { id: 99, offer_id: id })).toThrow(
    "no suggestion 99",
  );
});

test("kit:save writes the kit files and marks the offer prepared", () => {
  const { id } = seedOffer();
  const result = jh(`kit:save --id ${id} --lang en`, {
    cv: { headline: "tailored" },
    steps: "1. Apply on the site",
    suggestions: [{ text: "Mention Docker" }],
  });
  expect(result.status).toBe("prepared");
  const dir = join(ctx.dataDir, "offers", id, "kit-en");
  expect(JSON.parse(readFileSync(join(dir, "cv.json"), "utf8"))).toEqual({
    headline: "tailored",
  });
  expect(readFileSync(join(dir, "steps.md"), "utf8")).toBe(
    "1. Apply on the site\n",
  );
  expect(existsSync(join(dir, "suggestions.json"))).toBe(true);
  expect(() => jh(`kit:save --id ${id} --lang fr`, {})).toThrow(
    "--lang must be it or en",
  );
});

test("kit:save never moves an offer back to prepared", () => {
  const { id } = seedOffer();
  setStatus(ctx.db, id, "applied");
  const kit = { cv: {}, steps: "x", suggestions: [] };
  expect(jh(`kit:save --id ${id} --lang it`, kit).status).toBe("applied");
});

test("--input reads the JSON from a file and deletes it only on success", () => {
  const { id } = seedOffer();
  const file = join(ctx.dataDir, "in.json");

  writeFileSync(file, JSON.stringify({ text: "", offer_id: id }));
  expect(() => jh(`suggestions:add --input ${file}`)).toThrow("invalid input");
  expect(existsSync(file)).toBe(true);

  writeFileSync(file, JSON.stringify({ text: "Add ERP", offer_id: id }));
  expect(jh(`suggestions:add --input ${file}`).text).toBe("Add ERP");
  expect(existsSync(file)).toBe(false);

  expect(() => jh(`suggestions:add --input ${file}`)).toThrow("no file at");
  expect(() => jh(`offers:get --id ${id} --input ${file}`)).toThrow();
});

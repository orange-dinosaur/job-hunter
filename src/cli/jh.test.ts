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
  expect(second.profile.weights.skills).toBe(35);
});

test("profile:check passes a valid profile and names the broken field", () => {
  jh("profile:show");
  expect(jh("profile:check")).toEqual({ ok: true });
  const path = join(ctx.dataDir, "search-profile.yaml");
  writeFileSync(
    path,
    readFileSync(path, "utf8").replace("salary: 10", "salary: 1"),
  );
  expect(() => jh("profile:check")).toThrow("weights: must sum to 100, got 91");
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
    expect.objectContaining({ id, fit_score: 68, locations: ["Bologna"] }),
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
  // (80*35 + 40*15) / 50 = 68
  expect(jh(`scores:set --id ${id}`, scoring)).toEqual({
    id,
    fit_score: 68,
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
  jh("cv:save --origin import --ref original.pdf", { headline: "first" });
  expect(
    jh("cv:save --origin suggestion", { headline: "second" }),
  ).toMatchObject({
    version: 2,
    file_path: "cv/versions/v002.json",
  });
  expect(jh("cv:current")).toMatchObject({
    version: 2,
    origin: "suggestion",
    confirmed: false,
    cv: { headline: "second" },
  });
  expect(() => jh("cv:save --origin magic", {})).toThrow(
    "--origin must be one of",
  );
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

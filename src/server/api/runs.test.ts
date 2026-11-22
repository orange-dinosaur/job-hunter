import { expect, test } from "bun:test";
import { openDb } from "../../db/migrate.ts";
import {
  listOffers,
  now,
  setScores,
  setStatus,
  upsertOffers,
} from "../../db/offers.ts";
import { rescoreInBatches, runsRoutes } from "./runs.ts";

test("the rescore count covers scored and dealbreaker offers across runs, not discarded ones", async () => {
  const db = openDb(":memory:");
  db.run("INSERT INTO search_runs (id) VALUES (1), (2)");
  const offers = (run: number, company: string) =>
    upsertOffers(db, [{ source: "indeed", title: "PM", company }], run).new[0]!;
  const a = offers(1, "Alpha");
  const b = offers(2, "Beta");
  const c = offers(2, "Gamma");
  offers(2, "Unscored");
  const weights = { role: 100 };
  setScores(
    db,
    a,
    {
      scores: [{ criterion: "role", score: 70, reason: "r" }],
      gaps: [],
      dealbreaker: null,
    },
    weights,
  );
  setScores(
    db,
    b,
    { scores: [], gaps: [], dealbreaker: "Remote only" },
    weights,
  );
  setScores(
    db,
    c,
    {
      scores: [{ criterion: "role", score: 50, reason: "r" }],
      gaps: [],
      dealbreaker: null,
    },
    weights,
  );
  setStatus(db, c, "discarded");

  const res = await runsRoutes(db)["/api/rescore"].GET().json();
  expect(res).toEqual({ count: 2, operation: null, progress: null });
});

// 25 offers scored long ago, and a stand-in for Claude that rescores up to
// `perBatch` of the listed offers each time it runs.
function rescoreSetup(perBatch: number) {
  const db = openDb(":memory:");
  const scoring = {
    scores: [{ criterion: "role", score: 60, reason: "r" }],
    gaps: [],
    dealbreaker: null,
  };
  const ids = upsertOffers(
    db,
    Array.from({ length: 25 }, (_, i) => ({
      source: "indeed",
      title: "PM",
      company: `C${i}`,
    })),
    null,
  ).new;
  for (const id of ids) setScores(db, id, scoring, { role: 100 });
  db.run("UPDATE offers SET scored_at = '2000-01-01T00:00:00Z'");

  const calls: string[][] = [];
  const start = ((_db: unknown, _type: unknown, opts: { args: string[] }) => {
    calls.push(opts.args);
    const [, before, , limit] = opts.args;
    const batch = listOffers(db, null, "scored", {
      before,
      limit: Number(limit),
    }).slice(0, perBatch);
    for (const o of batch) setScores(db, o.id, scoring, { role: 100 });
    return { id: 0, existing: false, done: Promise.resolve() };
  }) as never;
  return { db, start, calls };
}

test("rescoring all offers runs batches of 10 until none are left", async () => {
  const { db, start, calls } = rescoreSetup(10);
  const before = now();
  await rescoreInBatches(db, before, start);
  expect(calls).toEqual(Array(3).fill(["--before", before, "--limit", "10"]));
  expect(listOffers(db, null, "scored", { before })).toEqual([]);
});

test("rescoring all offers stops when a batch saves nothing", async () => {
  const { db, start, calls } = rescoreSetup(0);
  await rescoreInBatches(db, now(), start);
  expect(calls).toHaveLength(1);
});

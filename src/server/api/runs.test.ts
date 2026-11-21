import { expect, test } from "bun:test";
import { openDb } from "../../db/migrate.ts";
import { setScores, setStatus, upsertOffers } from "../../db/offers.ts";
import { runsRoutes } from "./runs.ts";

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
  expect(res).toEqual({ count: 2, operation: null });
});

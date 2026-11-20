import { expect, test } from "bun:test";
import { migrate, openDb } from "./migrate.ts";
import {
  dedupeKey,
  getOffer,
  refitScores,
  setScores,
  setStatus,
  upsertOffers,
} from "./offers.ts";

function setup() {
  const db = openDb(":memory:");
  const run1 = Number(
    db.run("INSERT INTO search_runs DEFAULT VALUES").lastInsertRowid,
  );
  const run2 = Number(
    db.run("INSERT INTO search_runs DEFAULT VALUES").lastInsertRowid,
  );
  return { db, run1, run2 };
}

test("dedupe key strips accents, case, punctuation and legal suffixes", () => {
  expect(
    dedupeKey("Società Rossi S.r.l.", "Sviluppatore  Software (m/f)"),
  ).toBe("societa rossi|sviluppatore software m f");
  expect(dedupeKey("ACME, S.p.A.", "Dev")).toBe(dedupeKey("Acme", "dev"));
  expect(dedupeKey("Acme Inc", "Dev")).toBe("acme|dev");
  expect(dedupeKey("SA", "Dev")).toBe("sa|dev");
});

test("migrations are idempotent", () => {
  const { db } = setup();
  migrate(db);
  expect(db.query("PRAGMA user_version").get()).toEqual({ user_version: 1 });
});

test("insert stores a new offer", () => {
  const { db, run1 } = setup();
  const res = upsertOffers(
    db,
    [
      {
        source: "indeed",
        url: "https://i/1",
        title: "Dev",
        company: "Acme",
        location: "Bologna",
        remote: false,
      },
    ],
    run1,
  );
  expect(res.new).toHaveLength(1);
  expect(res.updated).toEqual([]);
  const offer = getOffer(db, res.new[0]!)!;
  expect(offer).toMatchObject({
    sources: ["indeed"],
    locations: ["Bologna"],
    remote: false,
    status: "new",
    first_seen_run_id: run1,
    last_seen_run_id: run1,
  });
});

test("upsert by dedupe key merges sources and locations without duplicates", () => {
  const { db, run1, run2 } = setup();
  const [id] = upsertOffers(
    db,
    [
      {
        source: "glassdoor",
        title: "Dev",
        company: "Acme SRL",
        location: "Emilia-Romagna, Italy",
      },
    ],
    run1,
  ).new;
  const res = upsertOffers(
    db,
    [
      {
        source: "indeed",
        url: "https://i/1",
        title: "dev",
        company: "Acme",
        location: "EMI, Italy",
      },
      {
        source: "glassdoor",
        title: "Dev",
        company: "Acme",
        location: "Emilia-Romagna, Italy",
      },
    ],
    run2,
  );
  expect(res).toEqual({ new: [], updated: [id!] });
  expect(getOffer(db, id!)).toMatchObject({
    sources: ["glassdoor", "indeed"],
    locations: ["Emilia-Romagna, Italy", "EMI, Italy"],
    url: "https://i/1",
    first_seen_run_id: run1,
    last_seen_run_id: run2,
  });
});

test("a source's own URL matches even when the title changed", () => {
  const { db, run1 } = setup();
  const [id] = upsertOffers(
    db,
    [{ source: "linkedin", url: "https://l/9", title: "Dev", company: "Acme" }],
    run1,
  ).new;
  const res = upsertOffers(
    db,
    [
      {
        source: "linkedin",
        url: "https://l/9",
        title: "Senior Dev",
        company: "Acme",
      },
    ],
    run1,
  );
  expect(res.updated).toEqual([id!]);
});

test("a discarded offer stays discarded when it shows up again", () => {
  const { db, run1, run2 } = setup();
  const [id] = upsertOffers(
    db,
    [{ source: "indeed", title: "Dev", company: "Acme" }],
    run1,
  ).new;
  setStatus(db, id!, "discarded", "not my field");
  upsertOffers(
    db,
    [{ source: "linkedin", title: "Dev", company: "Acme S.p.A." }],
    run2,
  );
  expect(getOffer(db, id!)).toMatchObject({
    status: "discarded",
    status_note: "not my field",
  });
});

test("setScores stores scores, gaps and the computed fit score", () => {
  const { db, run1 } = setup();
  const [id] = upsertOffers(
    db,
    [{ source: "indeed", title: "Dev", company: "Acme" }],
    run1,
  ).new;
  const weights = { skills: 60, location: 40 };
  setScores(
    db,
    id!,
    {
      scores: [
        { criterion: "skills", score: 90, reason: "TypeScript and SQL match" },
        { criterion: "location", score: 50, reason: "40 km away" },
      ],
      gaps: ["Kubernetes"],
      dealbreaker: null,
    },
    weights,
  );
  setScores(
    db,
    id!,
    {
      scores: [{ criterion: "skills", score: 70, reason: "rescored" }],
      gaps: [],
      dealbreaker: "relocation",
    },
    weights,
  );
  expect(getOffer(db, id!)).toMatchObject({
    fit_score: 70,
    dealbreaker: "relocation",
    scores: [{ criterion: "skills", score: 70, reason: "rescored" }],
    gaps: [],
  });
});

test("refitScores recomputes fit scores with new weights and skips dealbreakers", () => {
  const { db, run1 } = setup();
  const [kept, unscored, blocked] = upsertOffers(
    db,
    [
      { source: "indeed", title: "Dev", company: "Acme" },
      { source: "indeed", title: "Ops", company: "Beta" },
      { source: "indeed", title: "PM", company: "Gamma" },
    ],
    run1,
  ).new;
  const scores = [
    { criterion: "skills", score: 90, reason: "match" },
    { criterion: "location", score: 50, reason: "far" },
  ];
  const old = { skills: 60, location: 40 };
  setScores(db, kept!, { scores, gaps: [], dealbreaker: null }, old);
  setScores(db, blocked!, { scores, gaps: [], dealbreaker: "relocation" }, old);
  db.run("UPDATE offers SET fit_score = NULL WHERE id = ?", [blocked!]);

  // role has no stored score, so its weight is shared: (90*20 + 50*60) / 80 = 60
  expect(refitScores(db, { role: 20, skills: 20, location: 60 })).toBe(1);
  expect(getOffer(db, kept!)!.fit_score).toBe(60);
  expect(getOffer(db, unscored!)!.fit_score).toBeNull();
  expect(getOffer(db, blocked!)!.fit_score).toBeNull();
});

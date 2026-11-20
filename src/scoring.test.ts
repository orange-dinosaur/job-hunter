import { expect, test } from "bun:test";
import { bandFor, fitScore } from "./scoring.ts";

test("bands start at their cut-off", () => {
  const bands = { strong: 80, apply: 70, maybe: 55 };
  expect(bandFor(80, bands)).toBe("strong");
  expect(bandFor(79, bands)).toBe("apply");
  expect(bandFor(55, bands)).toBe("maybe");
  expect(bandFor(54, bands)).toBe("skip");
  expect(bandFor(null, bands)).toBeNull();
});

const weights = {
  skills: 35,
  experience: 25,
  domain: 15,
  location: 15,
  salary: 10,
};

test("weighted sum of all criteria", () => {
  const scores = [
    { criterion: "skills", score: 80 },
    { criterion: "experience", score: 60 },
    { criterion: "domain", score: 100 },
    { criterion: "location", score: 40 },
    { criterion: "salary", score: 0 },
  ];
  // (80*35 + 60*25 + 100*15 + 40*15 + 0*10) / 100 = 64
  expect(fitScore(scores, weights)).toBe(64);
});

test("unscored criteria drop out and the rest are renormalized", () => {
  const scores = [
    { criterion: "skills", score: 100 },
    { criterion: "experience", score: 0 },
  ];
  // 100*35 / 60 = 58.3
  expect(fitScore(scores, weights)).toBe(58);
});

test("criteria without a weight are ignored; nothing weighted gives null", () => {
  expect(fitScore([{ criterion: "vibes", score: 100 }], weights)).toBeNull();
  expect(fitScore([], weights)).toBeNull();
});

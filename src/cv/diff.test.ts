import { expect, test } from "bun:test";
import { diffCv } from "./diff.ts";
import { sampleCv } from "./sample-cv.ts";

test("diffCv lists changed, added and removed fields", () => {
  const after = structuredClone(sampleCv);
  after.headline = "Nuovo titolo";
  after.other = [...sampleCv.other, "Patente B"];
  after.languages = [];
  const changes = diffCv(sampleCv, after);
  expect(changes).toContainEqual({
    field: "headline",
    before: sampleCv.headline,
    after: "Nuovo titolo",
  });
  expect(changes).toContainEqual({
    field: `other ${sampleCv.other.length + 1}`,
    before: null,
    after: "Patente B",
  });
  expect(changes).toContainEqual({
    field: "languages 1 › language",
    before: sampleCv.languages[0]!.language,
    after: null,
  });
  expect(diffCv(sampleCv, structuredClone(sampleCv))).toEqual([]);
});

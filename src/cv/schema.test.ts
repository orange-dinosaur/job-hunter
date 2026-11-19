import { expect, test } from "bun:test";
import { sampleCv } from "./sample-cv.ts";
import { masterCvSchema } from "./schema.ts";

const issues = (cv: unknown) =>
  masterCvSchema.safeParse(cv).error?.issues.map((i) => i.path.join("."));

test("a complete CV is valid", () => {
  expect(masterCvSchema.parse(sampleCv)).toEqual(sampleCv);
});

test("dates must be YYYY or YYYY-MM", () => {
  const cv = structuredClone(sampleCv);
  cv.experience[0]!.start = "03/2020";
  cv.education[0]!.end = "2019-13";
  expect(issues(cv)).toEqual(["experience.0.start", "education.0.end"]);
});

test("unknown fields and empty text are rejected", () => {
  expect(issues({ ...sampleCv, hobbies: ["calcio"] })).toEqual([""]);
  expect(
    issues({ ...sampleCv, skills: [{ group: " ", items: ["SQL"] }] }),
  ).toEqual(["skills.0.group"]);
});

test("missing sections fail rather than default", () => {
  const cv: Partial<typeof sampleCv> = { ...sampleCv };
  delete cv.certifications;
  expect(issues(cv)).toEqual(["certifications"]);
});

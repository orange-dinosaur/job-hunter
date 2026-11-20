import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EXAMPLE_PATH, ensureProfile, loadProfile } from "./load.ts";

const dir = mkdtempSync(join(tmpdir(), "jh-profile-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const example = readFileSync(EXAMPLE_PATH, "utf8");

function write(name: string, text: string): string {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

test("the example profile is valid", () => {
  const profile = loadProfile(EXAMPLE_PATH);
  expect(profile.locations).toEqual([
    { place: "Bologna", radius_km: 30 },
    "remote",
  ]);
  expect(profile.weights.role).toBe(25);
  expect(profile.bands).toEqual({ strong: 80, apply: 70, maybe: 55 });
  expect(profile.follow_up_days).toEqual([7, 14]);
});

test("weights not summing to 100 fail with the sum", () => {
  const path = write(
    "sum.yaml",
    example.replace("location: 20", "location: 10"),
  );
  expect(() => loadProfile(path)).toThrow("weights: must sum to 100, got 90");
});

test("bands out of order and follow-up days out of order fail", () => {
  const path = write(
    "order.yaml",
    example.replace("apply: 70", "apply: 85").replace("[7, 14]", "[14, 7]"),
  );
  let message = "";
  try {
    loadProfile(path);
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("bands: strong, apply and maybe must go");
  expect(message).toContain("follow_up_days: the second reminder");
});

test("a profile without the new fields fails", () => {
  const path = write(
    "old.yaml",
    example.replace(/^bands:[\s\S]*?\[7, 14\]\n/m, ""),
  );
  expect(() => loadProfile(path)).toThrow("bands");
});

test("errors name the field", () => {
  const path = write(
    "fields.yaml",
    example
      .replace("radius_km: 30", "radius_km: far")
      .replace("  - it\n", "  - italian\n")
      .replace(/^roles:.*$/m, "rolez:"),
  );
  let message = "";
  try {
    loadProfile(path);
  } catch (err) {
    message = (err as Error).message;
  }
  expect(message).toContain("fields.yaml is invalid");
  expect(message).toContain("roles:");
  expect(message).toContain("locations.0");
  expect(message).toContain("languages.0: use a two-letter code");
});

test("broken YAML fails with the file name", () => {
  const path = write("broken.yaml", "roles: [unclosed");
  expect(() => loadProfile(path)).toThrow("broken.yaml:");
});

test("ensureProfile copies the example once", () => {
  const path = join(dir, "nested", "search-profile.yaml");
  expect(ensureProfile(path)).toBe(true);
  expect(readFileSync(path, "utf8")).toBe(example);
  expect(ensureProfile(path)).toBe(false);
});

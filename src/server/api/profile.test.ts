import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../db/migrate.ts";
import { EXAMPLE_PATH, loadProfile } from "../../profile/load.ts";
import { profileRoutes, type ProfileState } from "./profile.ts";

let dir: string;
let path: string;
let routes: ReturnType<typeof profileRoutes>;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "jh-profile-"));
  path = join(dir, "search-profile.yaml");
  copyFileSync(EXAMPLE_PATH, path);
  routes = profileRoutes(openDb(":memory:"), path, EXAMPLE_PATH);
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const get = async () =>
  (await routes["/api/profile"].GET().json()) as ProfileState;

const put = (body: unknown) =>
  routes["/api/profile"].PUT(
    new Request("http://x", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

test("a saved profile is written as YAML the loader reads back", async () => {
  const before = await get();
  expect(before.is_example).toBe(true);

  const changed = {
    ...before.profile!,
    roles: ["IT project manager"],
    weights: {
      role: 25,
      skills: 25,
      experience: 20,
      domain: 10,
      location: 10,
      salary: 10,
    },
  };
  const r = await put(changed);
  expect(r.status).toBe(200);
  expect(((await r.json()) as ProfileState).is_example).toBe(false);
  expect(loadProfile(path)).toEqual(changed);
});

test("weights that do not sum to 100 are refused and the file is kept", async () => {
  const { profile } = await get();
  const r = await put({
    ...profile!,
    weights: { ...profile!.weights, skills: 50 },
  });
  expect(r.status).toBe(400);
  expect(((await r.json()) as { error: string }).error).toContain(
    "must sum to 100",
  );
  expect((await get()).is_example).toBe(true);
});

test("a broken hand edit shows as an error instead of a form", async () => {
  writeFileSync(path, "roles: [\n");
  const state = await get();
  expect(state.profile).toBeNull();
  expect(state.error).toContain("search-profile.yaml");
});

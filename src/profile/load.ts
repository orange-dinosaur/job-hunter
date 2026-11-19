import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { searchProfileSchema, type SearchProfile } from "./schema.ts";

export const PROFILE_PATH = join(
  import.meta.dir,
  "../../data/search-profile.yaml",
);
export const EXAMPLE_PATH = join(
  import.meta.dir,
  "../../search-profile.example.yaml",
);

export class ProfileError extends Error {}

// Copies the example profile into place when none exists. Returns true if it did.
export function ensureProfile(
  path = PROFILE_PATH,
  example = EXAMPLE_PATH,
): boolean {
  if (existsSync(path)) return false;
  mkdirSync(dirname(path), { recursive: true });
  copyFileSync(example, path);
  return true;
}

export function loadProfile(path = PROFILE_PATH): SearchProfile {
  const name = basename(path);
  let data: unknown;
  try {
    data = Bun.YAML.parse(readFileSync(path, "utf8"));
  } catch (err) {
    throw new ProfileError(`${name}: ${(err as Error).message}`);
  }
  const result = searchProfileSchema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new ProfileError(`${name} is invalid:\n${lines.join("\n")}`);
  }
  return result.data;
}

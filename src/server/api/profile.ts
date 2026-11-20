import type { Database } from "bun:sqlite";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import { refitScores } from "../../db/offers.ts";
import {
  EXAMPLE_PATH,
  loadProfile,
  PROFILE_PATH,
  ProfileError,
} from "../../profile/load.ts";
import { searchProfileSchema } from "../../profile/schema.ts";

const HEADER =
  "# Saved from the dashboard. Edit here or on the Search profile page.\n" +
  "# `bun run jh profile:check` validates it.\n\n";

function profileState(path: string, example: string) {
  const isExample =
    existsSync(path) &&
    readFileSync(path, "utf8") === readFileSync(example, "utf8");
  try {
    return { profile: loadProfile(path), error: null, is_example: isExample };
  } catch (err) {
    if (!(err instanceof ProfileError)) throw err;
    return { profile: null, error: err.message, is_example: false };
  }
}

export type ProfileState = ReturnType<typeof profileState>;

export function profileRoutes(
  db: Database,
  path = PROFILE_PATH,
  example = EXAMPLE_PATH,
) {
  return {
    "/api/profile": {
      GET: () => Response.json(profileState(path, example)),
      async PUT(req: Request) {
        const input = searchProfileSchema.safeParse(
          await req.json().catch(() => null),
        );
        if (!input.success)
          return Response.json(
            { error: z.prettifyError(input.error) },
            { status: 400 },
          );
        writeFileSync(path, HEADER + Bun.YAML.stringify(input.data, null, 2));
        refitScores(db, input.data.weights);
        return Response.json(profileState(path, example));
      },
    },
  };
}

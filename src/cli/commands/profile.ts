import { join } from "node:path";
import { ensureProfile, loadProfile } from "../../profile/load.ts";
import type { Command, Context } from "../command.ts";

export const profilePath = (ctx: Context) =>
  join(ctx.dataDir, "search-profile.yaml");

export const profileCommands: Record<string, Command> = {
  "profile:show": {
    help: "Print the search profile, copying the example first if none exists",
    run(ctx) {
      const path = profilePath(ctx);
      const created = ensureProfile(path);
      return {
        ...(created && {
          note: `No search profile found. Copied the example to ${path}. Edit it before searching.`,
        }),
        profile: loadProfile(path),
      };
    },
  },
  "profile:check": {
    help: "Validate the search profile",
    run(ctx) {
      loadProfile(profilePath(ctx));
      return { ok: true };
    },
  },
};

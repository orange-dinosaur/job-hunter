import { z } from "zod";
import {
  kinds,
  sectors,
  sizes,
  upsertCompanyFromSearch,
} from "../../db/companies.ts";
import { readInput, type Command } from "../command.ts";

const text = z.string().trim().min(1);
const optional = text.nullable().default(null);

const addInput = z
  .array(
    z.strictObject({
      name: text,
      sector: z.enum(sectors),
      size: z.enum(sizes),
      kind: z.enum(kinds),
      town: optional,
      website: optional,
      careers_url: optional,
      reason: text,
    }),
  )
  .max(20);

export const companiesCommands: Record<string, Command> = {
  "companies:list": {
    help: "List known companies so a search can skip them",
    run(ctx) {
      return ctx.db
        .query("SELECT key, name, town, origin FROM companies ORDER BY key")
        .all();
    },
  },
  "companies:add": {
    help: "Save companies found by a search, at most 20 (stdin: [{name, sector, size, kind, town, website, careers_url, reason}])",
    stdin: true,
    run(ctx, _flags, stdin) {
      const companies = readInput(addInput, stdin);
      const added: string[] = [];
      const merged: string[] = [];
      ctx.db.transaction(() => {
        for (const c of companies)
          (upsertCompanyFromSearch(ctx.db, c) ? added : merged).push(c.name);
      })();
      return { added, merged };
    },
  },
};

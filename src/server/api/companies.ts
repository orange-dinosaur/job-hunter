import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { listCompanies, toggleWatched } from "../../db/companies.ts";
import { DATA_DIR } from "../../db/migrate.ts";
import { loadProfile } from "../../profile/load.ts";
import { bandFor } from "../../scoring.ts";

export function companiesRoutes(db: Database, dataDir = DATA_DIR) {
  return {
    "/api/companies": {
      GET(req: Request) {
        const q = new URL(req.url).searchParams;
        const filter = (name: string) => q.get(name) || undefined;
        const { bands } = loadProfile(join(dataDir, "search-profile.yaml"));
        const companies = listCompanies(db, {
          sector: filter("sector"),
          size: filter("size"),
          kind: filter("kind"),
          location: filter("location"),
        }).map((c) => ({
          ...c,
          offers: c.offers.map((o) => ({
            ...o,
            band: bandFor(o.fit_score, bands),
          })),
        }));
        return Response.json(companies);
      },
    },
    "/api/companies/:key/watch": {
      POST(req: Bun.BunRequest<"/api/companies/:key/watch">) {
        const watched = toggleWatched(db, req.params.key);
        return watched == null
          ? Response.json({ error: "no such company" }, { status: 404 })
          : Response.json({ key: req.params.key, watched });
      },
    },
  };
}

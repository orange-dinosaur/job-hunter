import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { listCompanies, toggleWatched } from "../../db/companies.ts";
import { DATA_DIR } from "../../db/migrate.ts";
import { loadProfile } from "../../profile/load.ts";
import { runOperation } from "../../runner/run-claude.ts";
import { bandFor } from "../../scoring.ts";
import type { SearchOperation } from "./runs.ts";

export function companiesRoutes(db: Database, dataDir = DATA_DIR) {
  const latestSearch = () =>
    db
      .query<SearchOperation, []>(
        "SELECT id, status, started_at, finished_at, error FROM operations WHERE type = 'company_search' ORDER BY id DESC LIMIT 1",
      )
      .get();

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
    // The latest company search, which the page polls while it runs.
    "/api/companies/search": {
      GET: () => Response.json(latestSearch()),
      POST() {
        runOperation(db, "company_search");
        return Response.json(latestSearch());
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

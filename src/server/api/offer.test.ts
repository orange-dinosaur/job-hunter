import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../db/migrate.ts";
import { upsertOffers } from "../../db/offers.ts";
import { offerRoutes, type OfferDetail } from "./offer.ts";

let db: Database;
let dataDir: string;
let routes: ReturnType<typeof offerRoutes>;
let id: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "jh-offer-"));
  copyFileSync(
    join(import.meta.dir, "../../../search-profile.example.yaml"),
    join(dataDir, "search-profile.yaml"),
  );
  db = openDb(":memory:");
  routes = offerRoutes(db, dataDir);
  id = upsertOffers(
    db,
    [{ source: "indeed", title: "Dev", company: "Acme", location: "Bologna" }],
    null,
  ).new[0]!;
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// Calls a route handler with params, the way Bun.serve would.
const call = (
  handler: (req: never) => Response | Promise<Response>,
  params: Record<string, string>,
  init?: RequestInit,
) => handler(Object.assign(new Request("http://x", init), { params }) as never);

test("a saved kit shows on the offer and its PDF is served", async () => {
  const dir = join(dataDir, "offers", id, "kit-en");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "steps.md"), "## Where to apply\n");
  writeFileSync(join(dir, "suggestions.json"), '[{"id":1,"text":"Add ERP"}]');
  writeFileSync(join(dir, "cv.pdf"), "%PDF-1.4");

  const r = await call(routes["/api/offers/:id"].GET, { id });
  const offer = (await r.json()) as OfferDetail;
  expect(offer.kits).toEqual([
    {
      lang: "en",
      has_pdf: true,
      steps: "## Where to apply\n",
      suggestions: [{ id: 1, text: "Add ERP" }],
    },
  ] as never);
  expect(offer.kit_operation).toBeNull();

  const pdf = routes["/api/offers/:id/kit/:lang/cv.pdf"].GET;
  expect((await call(pdf, { id, lang: "en" })).status).toBe(200);
  expect((await call(pdf, { id, lang: "it" })).status).toBe(404);
  expect((await call(pdf, { id, lang: "../../x" })).status).toBe(404);
});

test("prepare rejects a language other than it or en", async () => {
  const r = await call(
    routes["/api/offers/:id/prepare"].POST,
    { id },
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lang: "fr" }),
    },
  );
  expect(r.status).toBe(400);
});

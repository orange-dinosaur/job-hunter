import type { Database } from "bun:sqlite";
import { openDb } from "../db/migrate.ts";
import index from "../web/index.html";
import { offersRoutes } from "./api/offers.ts";
import { runsRoutes } from "./api/runs.ts";

const PORT = 4317;

// --hot reruns this file on every save but keeps globalThis, so the database
// opens once and the tab opens once per start.
const g = globalThis as { db?: Database; dashboardOpened?: boolean };
const db = (g.db ??= openDb());

const server = Bun.serve({
  port: PORT,
  routes: {
    ...offersRoutes(db),
    ...runsRoutes(db),
    "/api/*": Response.json({ error: "not found" }, { status: 404 }),
    "/*": index,
  },
  development: true,
});

if (!g.dashboardOpened) {
  g.dashboardOpened = true;
  console.log(`Dashboard at ${server.url}`);
  Bun.spawn(["xdg-open", server.url.href], {
    stdout: "ignore",
    stderr: "ignore",
  });
}

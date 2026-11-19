import { expect, test } from "bun:test";
import { openDb } from "../../db/migrate.ts";
import { modelFor } from "../../runner/models.ts";
import { agentRoutes, type AgentResponse } from "./agent.ts";

test("agent totals group operations and the model choice is saved", async () => {
  const db = openDb(":memory:");
  const op = db.query(
    "INSERT INTO operations (type, model, status, started_at, cost_usd, input_tokens, output_tokens) VALUES (?, 'sonnet', 'succeeded', ?, ?, 10, 5)",
  );
  op.run("search_run", "2026-11-19T10:00:00Z", 0.5);
  op.run("search_run", "2026-11-20T10:00:00Z", 0.25);
  op.run("cv_import", "2026-10-01T10:00:00Z", 1);
  db.run(
    "INSERT INTO operations (type, status) VALUES ('search_run', 'queued')",
  );

  const routes = agentRoutes(db);
  const data: AgentResponse = await routes["/api/agent"].GET().json();
  expect(data.operations).toHaveLength(4);
  expect(data.totals.month).toEqual([
    { key: "2026-11", count: 2, cost_usd: 0.75, tokens: 30 },
    { key: "2026-10", count: 1, cost_usd: 1, tokens: 15 },
  ]);
  expect(data.totals.type.map((t) => [t.key, t.count])).toEqual([
    ["search_run", 2],
    ["cv_import", 1],
  ]);
  expect(data.totals.day).toHaveLength(3);

  const post = (body: unknown) =>
    routes["/api/agent/models"].POST(
      new Request("http://x", { method: "POST", body: JSON.stringify(body) }),
    );
  expect((await post({ type: "search_run", model: "gpt" })).status).toBe(400);
  expect((await post({ type: "search_run", model: "haiku" })).status).toBe(200);
  expect(modelFor(db, "search_run")).toBe("haiku");
});

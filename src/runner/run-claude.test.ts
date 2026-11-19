import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../db/migrate.ts";
import { runOperation } from "./run-claude.ts";

// A fake `claude` on PATH. It records its arguments and the operation id, then
// behaves as FAKE_CLAUDE_MODE says.
const binDir = mkdtempSync(join(tmpdir(), "jh-fake-claude-"));
const argsFile = join(binDir, "args");
const okJson = JSON.stringify({
  type: "result",
  subtype: "success",
  is_error: false,
  result: "done",
  session_id: "sess-1",
  duration_ms: 1234,
  total_cost_usd: 0.05,
  usage: {
    input_tokens: 10,
    output_tokens: 20,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 40,
  },
  modelUsage: { "claude-sonnet-5-5": { costUSD: 0.05 } },
});
const errorJson = JSON.stringify({
  subtype: "error_during_execution",
  is_error: true,
  result: "The search profile is invalid",
  total_cost_usd: 0.01,
});
writeFileSync(
  join(binDir, "claude"),
  `#!/bin/sh
printf '%s\\n' "$@" > "${argsFile}"
echo "$JH_OPERATION_ID" >> "${argsFile}"
case "$FAKE_CLAUDE_MODE" in
  ok) echo '${okJson}' ;;
  error) echo '${errorJson}'; exit 1 ;;
  garbage) echo "not json"; echo "boom" >&2; exit 2 ;;
  slow) sleep 0.3; echo '${okJson}' ;;
esac
`,
);
chmodSync(join(binDir, "claude"), 0o755);

const originalPath = process.env.PATH;
beforeAll(() => {
  process.env.PATH = `${binDir}:${originalPath}`;
});
afterAll(() => {
  process.env.PATH = originalPath;
  delete process.env.FAKE_CLAUDE_MODE;
  rmSync(binDir, { recursive: true, force: true });
});

let db: Database;
beforeEach(() => {
  db = openDb(":memory:");
});

const operation = (id: number) =>
  db.query("SELECT * FROM operations WHERE id = ?").get(id) as Record<
    string,
    unknown
  >;

test("success stores usage, cost and session", async () => {
  process.env.FAKE_CLAUDE_MODE = "ok";
  const op = runOperation(db, "search_run");
  expect(operation(op.id).status).toBe("running");
  await op.done;
  expect(operation(op.id)).toMatchObject({
    type: "search_run",
    model: "sonnet",
    status: "succeeded",
    duration_ms: 1234,
    cost_usd: 0.05,
    input_tokens: 10,
    output_tokens: 20,
    cache_read_tokens: 30,
    cache_creation_tokens: 40,
    session_id: "sess-1",
    error: null,
  });
  expect(JSON.parse(operation(op.id).model_usage as string)).toEqual({
    "claude-sonnet-5-5": { costUSD: 0.05 },
  });
  expect(operation(op.id).finished_at).toBeString();
  expect(readFileSync(argsFile, "utf8").split("\n")).toEqual([
    "-p",
    "--model",
    "sonnet",
    "--output-format",
    "json",
    "--",
    "/job-search",
    String(op.id),
    "",
  ]);
});

test("the model comes from settings and args follow the command", async () => {
  process.env.FAKE_CLAUDE_MODE = "ok";
  db.run("INSERT INTO settings VALUES ('model.application_kit', 'haiku')");
  db.run(
    "INSERT INTO offers (id, dedupe_key, title, company) VALUES ('o1', 'k', 'Dev', 'Acme')",
  );
  const op = runOperation(db, "application_kit", {
    offerId: "o1",
    args: ["o1", "en"],
  });
  await op.done;
  const args = readFileSync(argsFile, "utf8").split("\n");
  expect(args[2]).toBe("haiku");
  expect(args[6]).toBe("/job-prepare o1 en");
  expect(operation(op.id)).toMatchObject({ offer_id: "o1", model: "haiku" });
});

test("a Claude error marks the operation failed with its message and cost", async () => {
  process.env.FAKE_CLAUDE_MODE = "error";
  const op = runOperation(db, "search_run");
  await op.done;
  expect(operation(op.id)).toMatchObject({
    status: "failed",
    error: "The search profile is invalid",
    cost_usd: 0.01,
  });
});

test("output that is not JSON fails with the exit code and stderr", async () => {
  process.env.FAKE_CLAUDE_MODE = "garbage";
  const op = runOperation(db, "search_run");
  await op.done;
  expect(operation(op.id)).toMatchObject({
    status: "failed",
    error: "claude exited with code 2 and no JSON result: boom",
  });
});

test("a second start of the same type and offer returns the running operation", async () => {
  process.env.FAKE_CLAUDE_MODE = "slow";
  const first = runOperation(db, "search_run");
  const second = runOperation(db, "search_run");
  expect(second).toMatchObject({ id: first.id, existing: true });
  const otherType = runOperation(db, "cv_import");
  expect(otherType.existing).toBe(false);
  await Promise.all([first.done, otherType.done]);
  const third = runOperation(db, "search_run");
  expect(third.existing).toBe(false);
  expect(third.id).not.toBe(first.id);
  await third.done;
});

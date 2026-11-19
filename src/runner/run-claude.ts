import type { Database } from "bun:sqlite";
import { join } from "node:path";
import { now } from "../db/offers.ts";
import { commandFor, modelFor, type OperationType } from "./models.ts";

const REPO_ROOT = join(import.meta.dir, "../..");

// Absolute, because a `cd` in the session moves what a `./` rule in settings.json
// points at, and every write to data/tmp/ is then refused.
export const allowedTools = [
  "Bash(bun run:*)",
  "Bash(uv run:*)",
  `Edit(/${join(REPO_ROOT, "data/tmp")}/**)`,
];

export interface StartedOperation {
  id: number;
  // True when an operation of the same type for the same offer was already queued or running.
  existing: boolean;
  // Settles once the operation row holds its final status. Never rejects.
  done: Promise<void>;
}

// The fields of `claude -p --output-format json` that get stored.
interface ClaudeResult {
  result?: string;
  is_error?: boolean;
  subtype?: string;
  session_id?: string;
  duration_ms?: number;
  total_cost_usd?: number;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  modelUsage?: Record<string, unknown>;
  permission_denials?: { tool_name?: string; tool_input?: unknown }[];
}

// A headless run cannot ask for permission, so a refused tool call usually means
// the work was not saved, even when Claude ends with a normal reply.
function refusals(out: ClaudeResult): string | null {
  const denied = out.permission_denials ?? [];
  if (!denied.length) return null;
  const lines = denied.map(
    (d) =>
      `- ${d.tool_name ?? "tool"}: ${JSON.stringify(d.tool_input).slice(0, 200)}`,
  );
  return `Claude was refused ${denied.length} tool call(s):\n${lines.join("\n")}`;
}

export function runOperation(
  db: Database,
  type: OperationType,
  opts: { offerId?: string; args?: string[] } = {},
): StartedOperation {
  const offerId = opts.offerId ?? null;
  const running = db
    .query<{ id: number }, [string, string | null]>(
      "SELECT id FROM operations WHERE type = ? AND offer_id IS ? AND status IN ('queued', 'running')",
    )
    .get(type, offerId);
  if (running)
    return { id: running.id, existing: true, done: Promise.resolve() };

  const model = modelFor(db, type);
  const id = Number(
    db.run(
      "INSERT INTO operations (type, offer_id, model, status) VALUES (?, ?, ?, 'queued')",
      [type, offerId, model],
    ).lastInsertRowid,
  );
  const prompt = [`/${commandFor[type]}`, ...(opts.args ?? [])].join(" ");
  return { id, existing: false, done: execute(db, id, model, prompt) };
}

async function execute(
  db: Database,
  id: number,
  model: string,
  prompt: string,
): Promise<void> {
  const started = Date.now();
  db.run(
    "UPDATE operations SET status = 'running', started_at = ? WHERE id = ?",
    [now(), id],
  );
  const finish = (fields: Record<string, string | number | null>) => {
    const cols = Object.keys(fields);
    db.run(
      `UPDATE operations SET ${cols.map((c) => `${c} = ?`).join(", ")}, finished_at = ? WHERE id = ?`,
      [...Object.values(fields), now(), id],
    );
  };

  try {
    const proc = Bun.spawn(
      [
        "claude",
        "-p",
        "--model",
        model,
        "--output-format",
        "json",
        "--allowedTools",
        ...allowedTools,
        "--",
        prompt,
      ],
      {
        cwd: REPO_ROOT,
        env: { ...process.env, JH_OPERATION_ID: String(id) },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    let out: ClaudeResult;
    try {
      out = JSON.parse(stdout);
    } catch {
      const detail = (stderr.trim() || stdout.trim()).slice(0, 2000);
      finish({
        status: "failed",
        duration_ms: Date.now() - started,
        error: `claude exited with code ${code} and no JSON result: ${detail}`,
      });
      return;
    }

    const refused = refusals(out);
    const failed = out.is_error === true || code !== 0 || refused !== null;
    finish({
      status: failed ? "failed" : "succeeded",
      duration_ms: out.duration_ms ?? Date.now() - started,
      cost_usd: out.total_cost_usd ?? null,
      input_tokens: out.usage?.input_tokens ?? null,
      output_tokens: out.usage?.output_tokens ?? null,
      cache_read_tokens: out.usage?.cache_read_input_tokens ?? null,
      cache_creation_tokens: out.usage?.cache_creation_input_tokens ?? null,
      model_usage: out.modelUsage ? JSON.stringify(out.modelUsage) : null,
      session_id: out.session_id ?? null,
      error: failed
        ? [
            refused,
            out.result || out.subtype || `claude exited with code ${code}`,
          ]
            .filter(Boolean)
            .join("\n\n")
        : null,
    });
  } catch (err) {
    finish({
      status: "failed",
      duration_ms: Date.now() - started,
      error: `could not run claude: ${(err as Error).message}`,
    });
  }
}

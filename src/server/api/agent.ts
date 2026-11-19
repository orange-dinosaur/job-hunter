import type { Database } from "bun:sqlite";
import { z } from "zod";
import {
  defaultModels,
  modelChoices,
  modelFor,
  modelSettingKey,
  operationTypes,
} from "../../runner/models.ts";

const modelInput = z.strictObject({
  type: z.enum(operationTypes),
  model: z.enum(modelChoices),
});

export interface OperationRow {
  id: number;
  type: string;
  offer_id: string | null;
  offer_title: string | null;
  model: string | null;
  status: string;
  started_at: string | null;
  duration_ms: number | null;
  cost_usd: number | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_creation_tokens: number | null;
  error: string | null;
}

export interface Total {
  key: string;
  count: number;
  cost_usd: number;
  tokens: number;
}

// Days and months follow the UTC timestamps stored on each operation.
const totalsBy = (db: Database, key: string) =>
  db
    .query<Total, []>(
      `SELECT ${key} AS key, count(*) AS count,
         coalesce(sum(cost_usd), 0) AS cost_usd,
         coalesce(sum(coalesce(input_tokens, 0) + coalesce(output_tokens, 0)
           + coalesce(cache_read_tokens, 0) + coalesce(cache_creation_tokens, 0)), 0) AS tokens
       FROM operations WHERE started_at IS NOT NULL
       GROUP BY key ORDER BY key DESC`,
    )
    .all();

function agent(db: Database) {
  return {
    choices: modelChoices,
    models: operationTypes.map((type) => ({
      type,
      model: modelFor(db, type),
      default: defaultModels[type],
    })),
    operations: db
      .query<OperationRow, []>(
        `SELECT o.id, o.type, o.offer_id, f.title AS offer_title, o.model, o.status,
           o.started_at, o.duration_ms, o.cost_usd, o.input_tokens, o.output_tokens,
           o.cache_read_tokens, o.cache_creation_tokens, o.error
         FROM operations o LEFT JOIN offers f ON f.id = o.offer_id
         ORDER BY o.id DESC LIMIT 200`,
      )
      .all(),
    totals: {
      day: totalsBy(db, "substr(started_at, 1, 10)"),
      month: totalsBy(db, "substr(started_at, 1, 7)"),
      type: totalsBy(db, "type"),
    },
  };
}

export type AgentResponse = ReturnType<typeof agent>;

export function agentRoutes(db: Database) {
  return {
    "/api/agent": {
      GET: () => Response.json(agent(db)),
    },
    "/api/agent/models": {
      async POST(req: Request) {
        const input = modelInput.safeParse(await req.json().catch(() => null));
        if (!input.success)
          return Response.json(
            { error: z.prettifyError(input.error) },
            { status: 400 },
          );
        db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [
          modelSettingKey(input.data.type),
          input.data.model,
        ]);
        return Response.json(agent(db));
      },
    },
  };
}

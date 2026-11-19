import { z } from "zod";
import { finishRun, getRun, startRun } from "../../db/runs.ts";
import { CommandError, intFlag, readInput, type Command } from "../command.ts";

const finishInput = z.strictObject({
  sources_ok: z.array(z.string().min(1)),
  sources_failed: z.array(
    z.strictObject({ source: z.string().min(1), error: z.string() }),
  ),
});

export const runCommands: Record<string, Command> = {
  "run:start": {
    help: "Start a search run and print its id",
    run(ctx) {
      // Set by the runner when the dashboard started this search.
      const operationId = Number(process.env.JH_OPERATION_ID) || null;
      return { id: startRun(ctx.db, operationId) };
    },
  },
  "run:finish": {
    help: "Finish a run (stdin: sources_ok, sources_failed with error text)",
    options: { id: { type: "string" } },
    stdin: true,
    run(ctx, flags, stdin) {
      const id = intFlag(flags, "id");
      if (!getRun(ctx.db, id)) throw new CommandError(`no search run ${id}`);
      const input = readInput(finishInput, stdin);
      finishRun(ctx.db, id, input.sources_ok, input.sources_failed);
      return getRun(ctx.db, id);
    },
  },
};

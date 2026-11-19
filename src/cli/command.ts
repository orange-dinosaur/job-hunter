import type { Database } from "bun:sqlite";
import type { ParseArgsOptionsConfig } from "node:util";
import type { z } from "zod";

export interface Context {
  db: Database;
  dataDir: string;
}

export type Flags = Record<string, string | boolean | undefined>;

export interface Command {
  help: string;
  options?: ParseArgsOptionsConfig;
  // Commands without this flag never read stdin, so they don't hang in a terminal.
  stdin?: true;
  run(ctx: Context, flags: Flags, stdin: string): unknown;
}

export class CommandError extends Error {}

export function readInput<T extends z.ZodType>(
  schema: T,
  stdin: string,
): z.infer<T> {
  let data: unknown;
  try {
    data = JSON.parse(stdin);
  } catch {
    throw new CommandError("stdin is not valid JSON");
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    const lines = result.error.issues.map(
      (i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`,
    );
    throw new CommandError(`invalid input:\n${lines.join("\n")}`);
  }
  return result.data;
}

export function requiredFlag(flags: Flags, name: string): string {
  const value = flags[name];
  if (typeof value !== "string" || !value)
    throw new CommandError(`--${name} is required`);
  return value;
}

export function intFlag(flags: Flags, name: string): number {
  const value = Number(requiredFlag(flags, name));
  if (!Number.isInteger(value))
    throw new CommandError(`--${name} must be a whole number`);
  return value;
}

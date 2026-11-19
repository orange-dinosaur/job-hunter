import { parseArgs } from "node:util";
import { DATA_DIR, openDb } from "../db/migrate.ts";
import {
  CommandError,
  type Command,
  type Context,
  type Flags,
} from "./command.ts";
import { cvCommands } from "./commands/cv.ts";
import { kitCommands } from "./commands/kit.ts";
import { offersCommands } from "./commands/offers.ts";
import { profileCommands } from "./commands/profile.ts";
import { runCommands } from "./commands/run.ts";
import { sourcesCommands } from "./commands/sources.ts";
import { suggestionsCommands } from "./commands/suggestions.ts";

export const commands: Record<string, Command> = {
  ...profileCommands,
  ...runCommands,
  ...sourcesCommands,
  ...offersCommands,
  ...cvCommands,
  ...suggestionsCommands,
  ...kitCommands,
};

export function helpText(): string {
  const width = Math.max(...Object.keys(commands).map((n) => n.length));
  return [
    "Usage: bun run jh <command> [flags]",
    "Every command prints JSON. Errors go to stderr with exit code 1.",
    "",
    ...Object.entries(commands).map(
      ([name, c]) => `  ${name.padEnd(width)}  ${c.help}`,
    ),
  ].join("\n");
}

export function runCommand(ctx: Context, argv: string[], stdin = ""): unknown {
  const [name, ...rest] = argv;
  const command = name ? commands[name] : undefined;
  if (!command)
    throw new CommandError(`unknown command: ${name}\n\n${helpText()}`);
  const { values } = parseArgs({ args: rest, options: command.options ?? {} });
  return command.run(ctx, values as Flags, stdin);
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  if (!argv.length || argv[0] === "--help" || argv[0] === "-h") {
    console.log(helpText());
    process.exit(0);
  }
  try {
    const stdin = commands[argv[0]!]?.stdin ? await Bun.stdin.text() : "";
    const result = runCommand({ db: openDb(), dataDir: DATA_DIR }, argv, stdin);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(`jh: ${(err as Error).message}`);
    process.exit(1);
  }
}

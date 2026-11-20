---
description: Run a job search, then score every new offer against the master CV
---

Run one job search and score its offers. Every `jh` command prints JSON. If a command not listed below as recoverable fails, stop and report its error as it is.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused.

1. Run `bun run jh run:start` and keep the `id` it prints as the run id.
2. Run `bun run jh profile:show`. If the output has a `note`, stop and show it: the profile is only the example.
3. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
4. Run `bun run jh sources:jobspy --run <run id> --results 5`. Keep its `sources_ok` and `sources_failed`.
   This step is recoverable. If the command fails, keep `sources_ok` as `[]` and `sources_failed` as `[{"source": "jobspy", "error": "<the error text>"}]`, skip step 5 and go on to step 6.
5. Read `prompts/scoring-rubric.md` once. Then run `bun run jh offers:list --run <run id> --unscored`. For each offer:
   - Read `data/offers/<id>/offer.md`.
   - Score it as the rubric says, against the CV from step 3 and the profile from step 2.
   - Write the JSON to `data/tmp/scores.json` and save it with `bun run jh scores:set --id <id> --input data/tmp/scores.json`.
   - If the save reports invalid fields, fix them and save again. If it still fails, note the offer id and move on.
6. Write `{"sources_ok": [...], "sources_failed": [...]}` from step 4 to `data/tmp/run.json` and run `bun run jh run:finish --id <run id> --input data/tmp/run.json`. Always run this step, even when earlier steps went wrong after step 1.
7. Reply with the run status, the failed sources with their errors, how many offers were scored, how many hit a dealbreaker, the five best offers by fit score (title, company, fit score), and any offer id that could not be saved.

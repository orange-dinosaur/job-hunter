---
description: Score one batch of scored offers again with the current rubric
argument-hint: --before <time> --limit <n>
---

Score again one batch of offers that already have scores or a dealbreaker. The batch is chosen by `$ARGUMENTS`, which must be `--before <time> --limit <n>`. If it is missing or has another shape, stop and say the usage is `/job-rescore --before <time> --limit <n>`. Every `jh` command prints JSON. If a command fails and these steps do not say how to recover, stop and report its error as it is.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused.

1. Run `bun run jh profile:show`. If the output has a `note`, stop and show it: the profile is only the example.
2. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
3. Read `prompts/scoring-rubric.md` once.
4. Run `bun run jh offers:list --scored $ARGUMENTS` once. Score exactly the offers it lists, all of them, and no others. For each offer:
   - Read `data/offers/<id>/offer.md`.
   - Score it from scratch as the rubric says, against the CV from step 2 and the profile from step 1. Ignore its old scores.
   - Write the JSON to `data/tmp/scores.json` and save it with `bun run jh scores:set --id <id> --input data/tmp/scores.json`.
   - If the save reports invalid fields, fix them and save again. If it still fails, note the offer id and move on.
5. Reply with how many offers were rescored, how many hit a dealbreaker, and any offer id that could not be saved. Do not list or score more offers: the next batch is another run.

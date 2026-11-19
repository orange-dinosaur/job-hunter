---
description: Run a job search, then score every new offer against the master CV
---

Run one job search and score its offers. Every `jh` command prints JSON. If a command not listed below as recoverable fails, stop and report its error as it is.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it.

1. Run `bun run jh run:start` and keep the `id` it prints as the run id.
2. Run `bun run jh profile:show`. If the output has a `note`, stop and show it: the profile is only the example.
3. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
4. Run `bun run jh sources:jobspy --run <run id> --results 5`. Keep its `sources_ok` and `sources_failed`.
   This step is recoverable. If the command fails, keep `sources_ok` as `[]` and `sources_failed` as `[{"source": "jobspy", "error": "<the error text>"}]`, skip step 5 and go on to step 6.
5. Run `bun run jh offers:list --run <run id> --unscored`. For each offer:
   - Read `data/offers/<id>/offer.md`.
   - Score it as described under "Scoring" below.
   - Write the JSON to `data/tmp/scores.json` and save it with `bun run jh scores:set --id <id> --input data/tmp/scores.json`.
   - If the save reports invalid fields, fix them and save again. If it still fails, note the offer id and move on.
6. Write `{"sources_ok": [...], "sources_failed": [...]}` from step 4 to `data/tmp/run.json` and run `bun run jh run:finish --id <run id> --input data/tmp/run.json`. Always run this step, even when earlier steps went wrong after step 1.
7. Reply with the run status, the failed sources with their errors, how many offers were scored, how many hit a dealbreaker, the five best offers by fit score (title, company, fit score), and any offer id that could not be saved.

## Scoring

The JSON for `scores:set` has this shape:

```json
{
  "scores": [{ "criterion": "skills", "score": 80, "reason": "one line" }],
  "gaps": ["one line per gap"],
  "dealbreaker": null
}
```

Dealbreakers come first. Set `dealbreaker` to one line naming the rule, with `scores` and `gaps` as `[]`, when the offer clearly:

- breaks one of the profile's `dealbreakers`,
- is from one of the `excluded_companies` or in one of the `excluded_sectors`,
- is written in a language outside `languages`,
- states a contract type outside `contract_types`.

Otherwise set `dealbreaker` to `null` and score each criterion from 0 to 100, with a one-line reason:

- `skills`: how well the CV's skills cover the skills the offer asks for.
- `experience`: how well the CV's years and kind of experience match the seniority asked for.
- `domain`: how close the offer's sector and product are to the CV's past work.
- `location`: how well the place and remote options fit the profile's `locations` and radius.
- `salary`: how the stated pay compares with `salary_floor`. Below the floor scores low.

Rules:

- Use only what the offer and the CV say. Do not credit a skill the CV does not list, even when a job title implies it.
- When the offer gives no information for a criterion (no salary stated, no seniority given), leave that criterion out of `scores`. Do not guess and do not score it 50. Add a gap such as "Salary not stated" instead.
- A gap is anything the offer asks for that the CV does not show: a skill, a certification, years of experience, a language level. Report each one. Never assume it away.
- Write reasons and gaps in Italian. Keep names of technologies, companies and certifications as written.

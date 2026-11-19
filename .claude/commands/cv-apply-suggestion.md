---
description: Work the candidate's answer to a CV suggestion into a new master CV version
argument-hint: <suggestion-id> <what is true, in the candidate's words>
---

Apply a CV suggestion using `$ARGUMENTS`: the first word is the suggestion id, the rest is the candidate's answer, meaning what is true about what the suggestion asks. If the id or the answer is missing, stop and say the usage is `/cv-apply-suggestion <suggestion-id> <what is true>`.

Every `jh` command prints JSON. If a command fails, stop and report its error as it is, except where a step says how to fix it.

1. Run `bun run jh suggestions:list --status open` and find the suggestion with that id. If it is not there, stop and say it is not open.
2. Run `bun run jh cv:current`.
3. Change the CV as described below.
4. Write the whole CV JSON with the Write tool to `data/tmp/cv.json` in this repository. Never use a heredoc or put JSON in the command line: they are refused. Run every command from the repository root and never `cd`. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused. Then run `bun run jh cv:save --origin suggestion --ref s<suggestion id> --input data/tmp/cv.json`. It saves a new unconfirmed version and marks the suggestion accepted. If it reports invalid fields, fix them and save again.
5. Reply with the new version number and each change as "field: before → after".

## Changing the CV

- Use only the answer and what the CV already says. The answer is the only new fact. Do not add anything the answer does not state, and do not make it sound bigger than it is.
- Put each fact where a reader of the CV would look for it: a bullet under the job it belongs to, a skill in the matching skills group, or a certification. Prefer extending an existing bullet over adding a new one.
- Keep the answer's numbers and names exactly. Rewrite only the wording, in Italian, in the style of the CV's other bullets.
- Change nothing else. Every other field stays exactly as it is, including typos.
- If the answer says the suggestion does not apply ("no", "non è vero", "mai usato"), change nothing, do not save, and reply that the suggestion should be dismissed instead.

---
description: Draft a follow-up email for an offer the candidate applied to
argument-hint: <offer-id> <it|en>
---

Draft a follow-up email for the offer and language in `$ARGUMENTS`: the first word is the offer id, the second is `it` or `en`. If either is missing or the language is something else, stop and say the usage is `/follow-up <offer-id> <it|en>`.

Every `jh` command prints JSON. If a command fails, stop and report its error as it is, except where a step says how to fix it.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused.

1. Run `bun run jh offers:get --id <offer id>`. Keep `applied_at`, `followed_up_at` and the company.
2. Read `data/offers/<offer id>/offer.md`.
3. Read `data/offers/<offer id>/cover-letter-<lang>.md` if it exists. If it does not, go on without it.
4. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
5. Read `prompts/unslop.md`.
6. Write the email as described below.
7. Check your draft against every pattern in `prompts/unslop.md`, then ask yourself what still makes it read as written by AI. Rewrite until nothing does.
8. Write `{"text": "<the email>"}` to `data/tmp/follow-up.json` and run `bun run jh followup:save --id <offer id> --lang <lang> --input data/tmp/follow-up.json`. It prints `words`. If `words` is over 120, shorten the email and save again.
9. Reply with the file path and the email text. Nothing is ever sent: the candidate sends it themselves.

## Honesty rule

The email may only use experience the master CV shows and facts the offer or the cover letter states. Never claim a skill, a result or a contact that is not there.

## The email

- In the kit language. With `en`, keep names of companies and products as written.
- First line: `Oggetto: <subject>` in Italian or `Subject: <subject>` in English, naming the role. Then a blank line, then the body.
- 60 to 120 words from greeting to closing.
- Greeting: "Buongiorno," or "Hello,". If the offer names a contact person, add the first name. Never "Gentili responsabili", "Spettabile" or "Dear Sir or Madam".
- Say which role the candidate applied for and when, with the date from `applied_at` written out ("il 12 novembre", "on 12 November"). If `applied_at` is missing, leave the date out.
- Ask in one plain sentence whether there is news on the selection, or when the candidate can expect to hear.
- Add one sentence on a single fact from the CV that fits the role. If the cover letter exists, do not repeat its main example word for word.
- If `followed_up_at` is set, this is the second follow-up: keep it to 60 to 80 words, say the candidate wrote before, and do not repeat the fit sentence.
- Closing on its own line ("Cordiali saluti," or "Kind regards,"), then the name from the CV on the next line.
- Plain words, first person, active voice. No em dashes. No pressure ("I look forward to your prompt reply") and no apology for writing.

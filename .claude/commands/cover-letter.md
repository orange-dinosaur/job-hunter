---
description: Write a cover letter for one offer and render it as a PDF
argument-hint: <offer-id> <it|en>
---

Write a cover letter for the offer and language in `$ARGUMENTS`: the first word is the offer id, the second is `it` or `en`. If either is missing or the language is something else, stop and say the usage is `/cover-letter <offer-id> <it|en>`.

Every `jh` command prints JSON. If a command fails, stop and report its error as it is, except where a step says how to fix it.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused.

1. Run `bun run jh offers:get --id <offer id>`. Keep its gaps.
2. Read `data/offers/<offer id>/offer.md`.
3. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
4. Read `prompts/unslop.md`.
5. Write the letter as described below.
6. Check your draft against every pattern in `prompts/unslop.md`, then ask yourself what still makes it read as written by AI. Rewrite until nothing does.
7. Fact-check the letter as described under "Fact-check" below.
8. Write `{"text": "<the letter>", "unsupported": [...]}` to `data/tmp/letter.json` and run `bun run jh letter:save --id <offer id> --lang <lang> --input data/tmp/letter.json`. It saves the text, renders the PDF and prints `words`. If `words` is outside 170 to 220, shorten or lengthen the letter, fact-check it again and save again.
9. Reply with the PDF path, the word count, which facts from the CV the letter uses for which requirements of the offer, and the unsupported claims.

## Honesty rule

The letter may only use experience, skills and results the master CV shows. A requirement of the offer that the master CV does not show is a gap. Never claim it, not even softened ("familiarity with", "exposure to", "quick to learn"). Do not list gaps either: the letter is about what the candidate brings, and leaves out what is missing.

## Fact-check

Go through the letter sentence by sentence and check every number, employer, job title, date and skill against the master CV. A claim is supported only if the master CV states it, in the same words or a plain synonym. A sentence that says more than the CV (a bigger scope, a different role, a result the CV does not give) is not supported.

- First remove or reword whatever breaks the honesty rule. Then check the letter again as it will be saved.
- List every claim you still cannot match to the master CV, even ones you think are fine. Do not change the letter after this list, so it matches what is saved.
- In `letter:save`, `unsupported` holds one `{"claim": "...", "where": "..."}` per claim, where `where` names the paragraph, such as "paragraph 2". An empty list means every claim checked out.

## The letter

It should read like a letter a person wrote in twenty minutes, not a summary of the CV. The CV is attached, so the letter does not repeat it.

- In the kit language. With `en`, keep names of companies, products, technologies and certifications as written.
- 170 to 220 words between greeting and closing. Three paragraphs, separated by a blank line.
- The text starts with the greeting and ends with the closing and the name. The PDF adds the header, date, company and subject, so leave those out.
- Greeting: "Buongiorno," in Italian or "Hello," in English. If the offer names a contact person, add the first name: "Buongiorno Marta,", "Hello Marta,". Never "Gentili responsabili", "Spettabile" or "Dear Sir or Madam".
- First paragraph: why this role, in two or three sentences. The subject line already names the role, so the first sentence does not announce the application. Open with what draws the candidate to this work or this team, tied to something in their own path. Never open with "mi candido", "con la presente", "I am writing to apply" or "I am excited".
- Second paragraph: one experience from the CV that matters most for this role, told as what the candidate did and what came of it. Name at most two tools or products. Do not list.
- Third paragraph: one or two sentences on what the candidate would bring to this team, then availability for an interview.
- Closing on its own line ("Cordiali saluti," or "Kind regards,"), then the name from the CV on the next line.
- Plain words, first person, active voice. No em dashes. No puffery about the company ("leader nel settore", "innovative").

## Flow

- Link sentences so each follows from the one before: "per questo", "così", "da lì", "because", "which is why". A reader should not feel a list cut into sentences.
- Mostly medium-length sentences. The unslop rule on rhythm means varying length, not a run of short statements.
- One idea per paragraph. If a paragraph needs a third fact, drop one.

---
description: Prepare an application kit for one offer, a tailored CV, steps to apply and CV suggestions
argument-hint: <offer-id> <it|en>
---

Prepare an application kit for the offer and language in `$ARGUMENTS`: the first word is the offer id, the second is `it` or `en`. If either is missing or the language is something else, stop and say the usage is `/job-prepare <offer-id> <it|en>`.

Every `jh` command prints JSON. If a command fails, stop and report its error as it is, except where a step says how to fix it.

1. Run `bun run jh offers:get --id <offer id>`. Keep its gaps.
2. Read `data/offers/<offer id>/offer.md`.
3. Run `bun run jh cv:current`. If there is no CV, stop and say to run `/cv-import` first.
4. Run `bun run jh suggestions:list --status open`.
5. Write the tailored CV, the steps and the suggestions as described below.
6. Record each suggestion with `bun run jh suggestions:add <<'EOF'`, then the JSON, then `EOF`, and keep the `id` it prints:
   - one that matches an open suggestion: `{"id": <its id>, "offer_id": "<offer id>"}`,
   - a new one: `{"text": "...", "offer_id": "<offer id>"}`.
7. Save the kit with `bun run jh kit:save --id <offer id> --lang <lang> <<'EOF'`, then `{"cv": {...}, "steps": "...", "suggestions": [...]}`, then `EOF`. Keep the `dir` it prints.
8. Run `bun run jh cv:render --file <dir>/cv.json --lang <lang> --out <dir>/cv.pdf`. If it reports invalid fields, fix them in the CV, save again with step 7, and render again.
9. Reply with the PDF path, the offer status, what you changed in the CV and why, and the suggestions with whether each was new or matched.

## Honesty rule

The tailored CV may only reword, reorder, select or bring out experience the master CV already shows. A requirement of the offer that the master CV does not show is a gap. Never write it into the CV, not even softened ("familiarity with", "exposure to"). If you are unsure whether the master CV supports a claim, leave it out.

## Tailored CV

Same JSON shape as the master CV from `cv:current`, keeping every field.

- Put the experience and skills that match the offer first. Within an entry, put the matching bullets first.
- Reword bullets to use the offer's terms where they mean the same thing as the master CV's words.
- Drop bullets, skills, projects and `other` items that do nothing for this offer. Keep every job and every degree, so the dates have no holes.
- Rewrite `headline` and `summary` for this offer, from facts in the master CV only.
- Keep `personal`, dates, company names and institutions exactly as they are.
- With `en`, translate every text field into English. Keep names of companies, products, technologies and certifications as written. With `it`, keep Italian.
- Plain words, no em dashes, no puffery ("passionate", "results-driven", "dynamic"). Name numbers and tools, not qualities.

## Steps

Markdown in the kit language, under these headings (in Italian: "Dove candidarsi", "Documenti da allegare", "Scadenza", "Contatto", "Follow-up"):

- **Where to apply:** the apply link from the offer, and the site or form it leads to. If the offer gives several ways, list each.
- **Documents to attach:** the tailored CV PDF, plus anything else the offer asks for (cover letter, references, portfolio, certificates). Say which of these the kit does not include.
- **Deadline:** the date the offer states, or "Not stated".
- **Contact:** the recruiter's or hiring manager's name and contact when the offer names them. Leave the heading out otherwise. Do not draft a message.
- **Follow-up:** one week after you apply. Give the date for applying today.

Use only what the offer says. Do not guess a link, a deadline or a contact.

## CV suggestions

A suggestion is one line naming a change to the master CV that would help with offers like this one, for example "Add the ERP systems used at <company>, if any". Base each on a gap from step 1 or on something the offer asks for that the master CV states vaguely.

- Phrase it as something the candidate checks and adds if true, never as a claim. The honesty rule still holds: a suggestion is a question to the candidate, not a fix.
- If an open suggestion from step 4 says the same thing, reuse its id instead of writing a new one.
- Three suggestions at most. None is fine.
- In `kit:save`, `suggestions` holds one `{"id": <id>, "text": "..."}` per suggestion, with the id from step 6.

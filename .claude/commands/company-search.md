---
description: Search the web for companies worth applying to directly and save them
---

Find companies near the places in the search profile that hire for its roles, so the candidate can apply to them directly. Every `jh` command prints JSON. If a command fails, stop and report its error as it is.

To pass JSON to a `jh` command, write it with the Write tool to a file in `data/tmp/` of this repository, then add `--input data/tmp/<file>` to the command. Never use a heredoc or put JSON in the command line: they are refused. `jh` deletes the file once the command succeeds. Run every command from the repository root and never `cd`, since these paths are relative to it. Run one `jh` command per Bash call, with no loops, pipes or `&&`: anything else is refused.

1. Run `bun run jh profile:show`. If the output has a `note`, stop and show it: the profile is only the example. Keep `roles`, `locations`, `excluded_companies` and `excluded_sectors`. Skip the `remote` location: it has no place to search.
2. Run `bun run jh companies:list`. These companies are known already. Do not save them again.
3. Search the web, at most 10 searches in all. Combine a role with a place ("software house Bologna", "aziende IT Rimini project manager"), and spread the searches across the places. Use WebFetch only to open a company's own site or careers page, to confirm what it does and where.
4. Choose at most 20 new companies. Leave out companies on the known list, companies in `excluded_companies` or `excluded_sectors`, and staffing agencies.
5. Write the list to `data/tmp/companies.json` and run `bun run jh companies:add --input data/tmp/companies.json`. If it reports invalid input, fix the named fields and run it again.
6. Reply with how many searches you ran, the companies `added` and `merged`, and one line per added company: name, town, and why.

## Each company

`{"name", "sector", "size", "kind", "town", "website", "careers_url", "reason"}`

- `name`: the company's own name as its site writes it, without the legal suffix.
- `sector`: one of `it_software`, `manufacturing`, `consulting`, `public_administration`, `banking_insurance`, `utilities_energy`, `retail_consumer`, `healthcare`, `logistics`, `other`.
- `size`: `startup`, `sme`, `large`, or `unknown` when no page you read says.
- `kind`: `end_client` (runs its own projects), `it_consultancy`, `staffing_agency`, `public_body`, or `unknown`.
- `town`: where its office near the profile's places is, or `null`.
- `website` and `careers_url`: URLs you saw in a search result or a page, or `null`. Never guess a URL.
- `reason`: one plain line on why it fits the profile's roles, from what you read. No puffery.

Only what a search result or a page states. If you are unsure about a field, use `unknown` or `null`.

---
description: Import a CV from a PDF as a new, unconfirmed master CV version
argument-hint: <path to the CV PDF>
---

Import the CV at `$ARGUMENTS` as a new master CV version.

1. Run `bun run jh cv:original --file "$ARGUMENTS"`. It copies the PDF into the repository and prints `path` and `ref`. If it fails, stop and report the error as it is.
2. Read the PDF at `path`.
3. Write the master CV as JSON in exactly this shape:

```json
{
  "personal": {
    "name": "...",
    "email": "... or null",
    "phone": "... or null",
    "location": "... or null",
    "links": [{ "label": "LinkedIn", "url": "..." }]
  },
  "headline": "... or null",
  "summary": "... or null",
  "experience": [
    {
      "role": "...",
      "company": "...",
      "place": "... or null",
      "start": "YYYY-MM or YYYY or null",
      "end": "YYYY-MM or YYYY, or null if ongoing or not given",
      "bullets": ["..."]
    }
  ],
  "skills": [{ "group": "...", "items": ["..."] }],
  "education": [
    {
      "degree": "...",
      "institution": "...",
      "place": "... or null",
      "start": "YYYY-MM or YYYY or null",
      "end": "YYYY-MM or YYYY or null",
      "details": ["..."]
    }
  ],
  "languages": [{ "language": "...", "level": "... or null" }],
  "certifications": [
    {
      "name": "...",
      "issuer": "... or null",
      "date": "YYYY-MM or YYYY or null"
    }
  ],
  "projects": [{ "name": "...", "description": "... or null" }],
  "other": ["one line per item that fits no section above"]
}
```

4. Write the JSON with the Write tool to `data/tmp/cv.json` in this repository. Never use a heredoc or put JSON in the command line: they are refused. Then save it, using the `ref` from step 1:
   `bun run jh cv:save --origin import --ref <ref> --input data/tmp/cv.json`. `jh` deletes the file once the save succeeds.
5. If the save reports invalid fields, fix those fields and save again.
6. Reply with the saved version number. Then list every field you left null or empty, and every place where the PDF was hard to read.

Rules:

- Use only what the PDF says. Do not add, infer or improve anything: no skills implied by a job title, no dates guessed from context, no polished wording. A field the PDF does not give is null or an empty list.
- All text is in Italian. If the PDF is in another language, translate it faithfully. Keep names of companies, products, technologies and certifications as written.
- Keep the PDF's own grouping of skills. If it has none, use one group named "Competenze".
- Copy bullet points one to one. Split a paragraph into bullets only where the PDF separates the items.

# Scoring rubric

How to score one offer against the master CV and the search profile. The result is the JSON that `jh scores:set` takes.

## JSON shape

```json
{
  "scores": [{ "criterion": "role", "score": 80, "reason": "one line" }],
  "gaps": ["one line per gap"],
  "dealbreaker": null,
  "company": {
    "sector": "it_software",
    "size": "unknown",
    "kind": "end_client"
  }
}
```

## Dealbreakers

Check these first. Set `dealbreaker` to one line naming the rule, with `scores` and `gaps` as `[]`, when the offer clearly:

- breaks one of the profile's `dealbreakers`,
- is from one of the `excluded_companies` or in one of the `excluded_sectors`,
- is written in a language outside `languages`,
- states a contract type outside `contract_types`.

Otherwise set `dealbreaker` to `null` and score the criteria below.

## Anchors

Every criterion uses the same bands. Each criterion below says what they mean for it.

- 90 to 100: covers every requirement and most nice-to-haves.
- 70 to 89: covers every must-have. Gaps are only in nice-to-haves.
- 50 to 69: covers most must-haves, with one or two real gaps.
- Below 50: misses several must-haves.

Pick the band first, then the number inside it. A score of 70 or more means you would tell the candidate to apply on that criterion alone.

## Criteria

Score each from 0 to 100, with a one-line reason.

- `role`: how close the offer's role is to one of the profile's `roles`. 90 to 100 is the same role under any title. 70 to 89 is the same role with a different emphasis, such as a project manager role that also asks for some analysis. 50 to 69 is a neighbouring role the CV could move into. Below 40 is a different job family, such as a developer role for a project manager.
- `skills`: how well the CV's skills cover the skills the offer asks for. 90 to 100 has every required skill and most nice-to-haves. 70 to 89 has every required skill. 50 to 69 misses one or two required skills. Below 50 misses several.
- `experience`: how well the CV's years and kind of experience match the seniority asked for. 90 to 100 matches the years and the kind of work. 70 to 89 matches the years, with the kind of work close. 50 to 69 is one or two years short, or the kind of work is partly different. Below 50 is clearly too junior or too senior.
- `domain`: how close the offer's sector and product are to the CV's past work. 90 to 100 is the same sector and product type. 70 to 89 is the same sector. 50 to 69 is a related sector. Below 50 is a sector the CV has never touched.
- `location`: how well the place and remote options fit the profile's `locations` and radius. 90 to 100 is remote, or inside a radius with a short commute. 70 to 89 is inside a radius. 50 to 69 is just outside a radius, or hybrid with some travel. Below 50 is well outside every radius with no remote option.
- `salary`: how the stated pay compares with `salary_floor`. 90 to 100 is well above the floor. 70 to 89 is at or a little above it. 50 to 69 is a little below it. Below 50 is clearly below it.

## Rules

- Use only what the offer and the CV say. Do not credit a skill the CV does not list, even when a job title implies it.
- When the offer gives no information for a criterion (no salary stated, no seniority given), leave that criterion out of `scores`. Do not guess and do not score it 50. Add a gap such as "Salary not stated" instead.
- A gap is anything the offer asks for that the CV does not show: a skill, a certification, years of experience, a language level. Report each one. Never assume it away.
- Write reasons and gaps in Italian. Keep names of technologies, companies and certifications as written.

## Company

Always fill `company`, also for an offer with a dealbreaker. Use only the offer text. Pick one value from each list:

- `sector`: `it_software`, `manufacturing`, `consulting`, `public_administration`, `banking_insurance`, `utilities_energy`, `retail_consumer`, `healthcare`, `logistics`, `other`.
- `size`: `startup`, `sme`, `large`, `unknown`. Use `unknown` unless the offer states the size or headcount.
- `kind`: `end_client` (hires for its own work), `it_consultancy` (sells IT projects or people to clients), `staffing_agency` (recruits for another company), `public_body`, `unknown`.

When the offer comes from a staffing agency and names no client, describe the agency.

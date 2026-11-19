import { z } from "zod";

const percent = z.int().min(0).max(100);

export const criteria = [
  "skills",
  "experience",
  "domain",
  "location",
  "salary",
] as const;
export type Criterion = (typeof criteria)[number];

export const searchProfileSchema = z.strictObject({
  roles: z.array(z.string().min(1)).min(1),
  locations: z
    .array(
      z.union(
        [
          z.literal("remote"),
          z.strictObject({
            place: z.string().min(1),
            radius_km: z.number().nonnegative(),
          }),
        ],
        { error: "use remote, or a place with radius_km as a number" },
      ),
    )
    .min(1),
  salary_floor: z.number().nonnegative().nullable(),
  contract_types: z.array(z.string().min(1)),
  languages: z
    .array(
      z.string().regex(/^[a-z]{2}$/, "use a two-letter code such as it or en"),
    )
    .min(1),
  excluded_companies: z.array(z.string().min(1)),
  excluded_sectors: z.array(z.string().min(1)),
  weights: z
    .strictObject(
      Object.fromEntries(criteria.map((c) => [c, percent])) as Record<
        Criterion,
        typeof percent
      >,
    )
    .refine((w) => Object.values(w).reduce((a, b) => a + b, 0) === 100, {
      error: (issue) => {
        const sum = Object.values(issue.input as Record<string, number>).reduce(
          (a, b) => a + b,
          0,
        );
        return `must sum to 100, got ${sum}`;
      },
    }),
  dealbreakers: z.array(z.string().min(1)),
});

export type SearchProfile = z.infer<typeof searchProfileSchema>;

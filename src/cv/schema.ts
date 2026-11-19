import { z } from "zod";

const text = z.string().trim().min(1);
const date = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2]))?$/, "use YYYY or YYYY-MM");

// The master CV. All text is in Italian. A field the source CV doesn't give is
// null or an empty list, never guessed.
export const masterCvSchema = z.strictObject({
  personal: z.strictObject({
    name: text,
    email: text.nullable(),
    phone: text.nullable(),
    location: text.nullable(),
    links: z.array(z.strictObject({ label: text, url: text })),
  }),
  headline: text.nullable(),
  summary: text.nullable(),
  experience: z.array(
    z.strictObject({
      role: text,
      company: text,
      place: text.nullable(),
      start: date.nullable(),
      // null when the job is ongoing or the CV gives no end.
      end: date.nullable(),
      bullets: z.array(text),
    }),
  ),
  skills: z.array(z.strictObject({ group: text, items: z.array(text).min(1) })),
  education: z.array(
    z.strictObject({
      degree: text,
      institution: text,
      place: text.nullable(),
      start: date.nullable(),
      end: date.nullable(),
      details: z.array(text),
    }),
  ),
  languages: z.array(
    z.strictObject({ language: text, level: text.nullable() }),
  ),
  certifications: z.array(
    z.strictObject({
      name: text,
      issuer: text.nullable(),
      date: date.nullable(),
    }),
  ),
  projects: z.array(
    z.strictObject({ name: text, description: text.nullable() }),
  ),
  // Lines that fit no section above, such as a driving licence or availability to travel.
  other: z.array(text),
});

export type MasterCv = z.infer<typeof masterCvSchema>;

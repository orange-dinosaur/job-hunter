import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { MasterCv } from "./schema.ts";

export const langs = ["it", "en"] as const;
export type Lang = (typeof langs)[number];

const TEMPLATE = join(import.meta.dir, "cv.typ");
const FONTS = join(import.meta.dir, "fonts");
const SCRIPT = join(import.meta.dir, "../../scripts/typst_render.py");

const labels = {
  it: {
    address: "Abitazione",
    email: "Indirizzo e-mail",
    phone: "Telefono",
    place: "Luogo",
    present: "Attuale",
    summary: "Profilo",
    experience: "Esperienza lavorativa",
    education: "Istruzione e formazione",
    languages: "Competenze linguistiche",
    skills: "Competenze",
    certifications: "Certificazioni",
    projects: "Progetti",
    other: "Ulteriori informazioni",
    consent:
      "Autorizzo il trattamento dei miei dati personali ai sensi del Regolamento UE 2016/679 (GDPR).",
  },
  en: {
    address: "Address",
    email: "Email address",
    phone: "Phone",
    place: "Location",
    present: "Present",
    summary: "Profile",
    experience: "Work experience",
    education: "Education and training",
    languages: "Language skills",
    skills: "Skills",
    certifications: "Certifications",
    projects: "Projects",
    other: "Additional information",
    consent:
      "I authorise the processing of my personal data under Regulation (EU) 2016/679 (GDPR).",
  },
} satisfies Record<Lang, Record<string, string>>;

// "2020-05" becomes "05/2020", "2015" stays as is.
function monthYear(date: string): string {
  const [year, month] = date.split("-");
  return month ? `${month}/${year}` : year!;
}

function dateRange(
  start: string | null,
  end: string | null,
  present: string,
): string | null {
  if (!start && !end) return null;
  const from = start ? monthYear(start) : "";
  const to = end ? monthYear(end) : present;
  return from ? `[ ${from} - ${to} ]` : `[ ${to} ]`;
}

// What the Typst template reads: section labels in the target language,
// formatted dates, and consecutive roles at the same company grouped together.
export function cvView(cv: MasterCv, lang: Lang, photo: boolean) {
  const l = labels[lang];
  const experience: {
    company: string;
    place: string | null;
    roles: { role: string; dates: string | null; bullets: string[] }[];
  }[] = [];
  for (const e of cv.experience) {
    const role = {
      role: e.role,
      dates: dateRange(e.start, e.end, l.present),
      bullets: e.bullets,
    };
    const last = experience.at(-1);
    if (last && last.company === e.company && last.place === e.place)
      last.roles.push(role);
    else experience.push({ company: e.company, place: e.place, roles: [role] });
  }
  return {
    lang,
    labels: l,
    photo,
    personal: cv.personal,
    headline: cv.headline,
    summary: cv.summary,
    experience,
    education: cv.education.map((e) => ({
      ...e,
      dates: dateRange(e.start, e.end, l.present),
    })),
    skills: cv.skills,
    languages: cv.languages,
    certifications: cv.certifications.map((c) => ({
      ...c,
      date: c.date ? monthYear(c.date) : null,
    })),
    projects: cv.projects,
    other: cv.other,
  };
}

// Renders the CV to a PDF at `out`. The photo is left out when `photo` is
// null or the file is missing.
export function renderCv(
  cv: MasterCv,
  lang: Lang,
  out: string,
  photo: string | null,
): void {
  const dir = mkdtempSync(join(tmpdir(), "jh-cv-"));
  try {
    const hasPhoto = photo !== null && existsSync(photo);
    if (hasPhoto) copyFileSync(photo, join(dir, "photo.jpg"));
    copyFileSync(TEMPLATE, join(dir, "cv.typ"));
    writeFileSync(
      join(dir, "view.json"),
      JSON.stringify(cvView(cv, lang, hasPhoto)),
    );
    const proc = Bun.spawnSync([
      "uv",
      "run",
      "--script",
      SCRIPT,
      join(dir, "cv.typ"),
      resolve(out),
      FONTS,
    ]);
    if (proc.exitCode !== 0) {
      const stderr = proc.stderr.toString().trim().split("\n").slice(-8);
      throw new Error(`typst render failed:\n${stderr.join("\n")}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

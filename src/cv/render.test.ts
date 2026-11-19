import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cvView, letterView, renderCv, renderLetter } from "./render.ts";
import { sampleCv } from "./sample-cv.ts";

test("cvView groups consecutive roles at one company and formats dates", () => {
  const job = sampleCv.experience[0]!;
  const cv = {
    ...sampleCv,
    experience: [
      job,
      { ...job, role: "Stagista", start: "2019-11", end: "2020-02" },
      { ...job, company: "Beta" },
    ],
  };
  const view = cvView(cv, "en", false);
  expect(view.labels.experience).toBe("Work experience");
  expect(view.experience.map((g) => g.roles.length)).toEqual([2, 1]);
  expect(view.experience[0]!.roles.map((r) => r.dates)).toEqual([
    "[ 03/2020 - Present ]",
    "[ 11/2019 - 02/2020 ]",
  ]);
  expect(view.education[0]!.dates).toBe("[ 2015 - 2019 ]");
});

test("renderCv writes a PDF whose text reads in layout order", () => {
  const dir = mkdtempSync(join(tmpdir(), "jh-render-"));
  try {
    const out = join(dir, "cv.pdf");
    renderCv(sampleCv, "it", out, null);
    const proc = Bun.spawnSync([
      "uv",
      "run",
      "--quiet",
      "--with",
      "pypdf",
      "python",
      "-I",
      "-c",
      "import sys,pypdf; print('\\n'.join(p.extract_text() for p in pypdf.PdfReader(sys.argv[1]).pages))",
      out,
    ]);
    expect(proc.exitCode).toBe(0);
    const text = proc.stdout.toString();
    // Each string must appear after the previous one.
    let from = 0;
    const missing = [
      "Mario Rossi",
      "ESPERIENZA",
      "Acme",
      "[ 03/2020 - Attuale ]",
      "Sviluppatore",
      "Sviluppo di API in TypeScript",
      "ISTRUZIONE",
      "Laurea in Informatica",
      "Patente di guida B",
      "Autorizzo il trattamento",
    ].filter((s) => {
      const at = text.indexOf(s, from);
      if (at === -1) return true;
      from = at + s.length;
      return false;
    });
    expect(missing).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

test("letterView splits paragraphs and dates the letter in the language", () => {
  const view = letterView(
    sampleCv.personal,
    { title: "Dev", company: "Acme" },
    "Gentili,\n\nUno.\n  \nCordiali saluti,\nMario Rossi\n",
    "it",
    new Date("2026-11-19T12:00:00Z"),
  );
  expect(view.subject).toBe("Oggetto: candidatura per Dev");
  expect(view.date).toBe("19 novembre 2026");
  expect(view.paragraphs).toEqual([
    "Gentili,",
    "Uno.",
    "Cordiali saluti,\nMario Rossi",
  ]);
});

test("renderLetter writes a PDF with the header, subject and body in order", () => {
  const dir = mkdtempSync(join(tmpdir(), "jh-letter-"));
  try {
    const out = join(dir, "letter.pdf");
    const view = letterView(
      sampleCv.personal,
      { title: "Dev", company: "Acme" },
      "Dear hiring team,\n\nI built APIs.\n\nKind regards,\nMario Rossi",
      "en",
    );
    renderLetter(view, out);
    const proc = Bun.spawnSync([
      "uv",
      "run",
      "--quiet",
      "--with",
      "pypdf",
      "python",
      "-I",
      "-c",
      "import sys,pypdf; print(pypdf.PdfReader(sys.argv[1]).pages[0].extract_text())",
      out,
    ]);
    const text = proc.stdout.toString();
    const order = [
      "Mario Rossi",
      "Acme",
      "Application for Dev",
      "Dear hiring team,",
      "I built APIs.",
      "Kind regards,",
    ].map((s) => text.indexOf(s));
    expect(order).not.toContain(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 60_000);

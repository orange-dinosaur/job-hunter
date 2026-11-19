import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cvView, renderCv } from "./render.ts";
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

import { afterEach, beforeEach, expect, test } from "bun:test";
import type { Database } from "bun:sqlite";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sampleCv } from "../../cv/sample-cv.ts";
import { saveCv } from "../../db/cv.ts";
import { openDb } from "../../db/migrate.ts";
import { cvRoutes, type CvState } from "./cv.ts";

let db: Database;
let dataDir: string;
let routes: ReturnType<typeof cvRoutes>;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), "jh-cv-"));
  db = openDb(":memory:");
  routes = cvRoutes(db, dataDir);
  mkdirSync(join(dataDir, "cv/originals"), { recursive: true });
  writeFileSync(join(dataDir, "cv/originals/a.pdf"), "%PDF-1.4");
  saveCv(db, dataDir, sampleCv, "import", "cv/originals/a.pdf");
});

afterEach(() => {
  db.close();
  rmSync(dataDir, { recursive: true, force: true });
});

// Calls a route handler with a version param, the way Bun.serve would.
const call = (
  handler: (req: never) => Response | Promise<Response>,
  version: number,
  init?: RequestInit,
) =>
  handler(
    Object.assign(new Request("http://x", init), {
      params: { version: String(version) },
    }) as never,
  );

const json = { headers: { "content-type": "application/json" } };

test("a draft is edited, confirmed, then only copied", async () => {
  const edited = { ...sampleCv, headline: "Titolo corretto" };
  let r = await call(routes["/api/cv/:version"].PUT, 1, {
    ...json,
    method: "PUT",
    body: JSON.stringify(edited),
  });
  expect(((await r.json()) as CvState).current?.cv).toMatchObject(edited);

  r = await call(routes["/api/cv/:version"].PUT, 1, {
    method: "PUT",
    body: JSON.stringify({ ...sampleCv, headline: "" }),
  });
  expect(r.status).toBe(400);

  await call(routes["/api/cv/:version/confirm"].POST, 1, { method: "POST" });
  r = await call(routes["/api/cv/:version"].PUT, 1, {
    method: "PUT",
    body: JSON.stringify(sampleCv),
  });
  expect(r.status).toBe(409);

  r = await call(routes["/api/cv/:version/restore"].POST, 1, {
    method: "POST",
  });
  const state = (await r.json()) as CvState;
  expect(state.current).toMatchObject({
    version: 2,
    origin: "restore",
    origin_ref: "v001",
    confirmed: false,
  });
  expect(state.changes).toEqual({ against: 1, list: [] });
  expect(state.has_pdf).toBe(true);

  // The copy shows the PDF of the import it came from.
  r = await call(routes["/api/cv/:version/pdf"].GET, 2);
  expect(r.headers.get("content-type")).toBe("application/pdf");
  expect(await r.text()).toBe("%PDF-1.4");
});

test("a PDF outside the originals folder is not served", async () => {
  db.run("UPDATE cv_versions SET origin_ref = '../../etc/passwd'");
  expect((await call(routes["/api/cv/:version/pdf"].GET, 1)).status).toBe(404);
});

test("an upload that is not a PDF is refused before any import starts", async () => {
  const upload = (name: string, body: string) => {
    const form = new FormData();
    form.append("file", new File([body], name));
    return routes["/api/cv/import"].POST(
      new Request("http://x", { method: "POST", body: form }),
    );
  };
  expect((await upload("cv.docx", "x")).status).toBe(400);
  expect((await upload("cv.pdf", "not a pdf")).status).toBe(400);
  expect(db.query("SELECT count(*) AS n FROM operations").get()).toEqual({
    n: 0,
  });
});

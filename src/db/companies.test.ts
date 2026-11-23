import { expect, test } from "bun:test";
import {
  getCompany,
  listCompanies,
  toggleWatched,
  upsertCompanyFromOffer,
} from "./companies.ts";
import { openDb } from "./migrate.ts";
import { companyKey, setStatus, upsertOffers } from "./offers.ts";

// Acme has an offer from run 1 and one new in run 2 (latest), Beta only an old
// one, Gamma a discarded one, and Delta no offers at all.
function companiesSetup() {
  const db = openDb(":memory:");
  db.run("INSERT INTO search_runs (id) VALUES (1), (2)");
  const offer = (
    company: string,
    title: string,
    location: string,
    run: number,
  ) =>
    upsertOffers(db, [{ source: "indeed", title, company, location }], run)
      .new[0]!;
  offer("Acme S.p.A.", "PM", "Bologna", 1);
  offer("Acme", "Analyst", "Modena", 2);
  offer("Beta", "PM", "Fano", 1);
  setStatus(db, offer("Gamma", "PM", "Rimini", 1), "discarded");
  db.run("UPDATE offers SET fit_score = 80 WHERE title = 'Analyst'");
  db.run("UPDATE offers SET fit_score = 60 WHERE company = 'Beta'");
  const it = {
    sector: "it_software",
    size: "sme",
    kind: "end_client",
  } as const;
  upsertCompanyFromOffer(db, "Acme", it);
  upsertCompanyFromOffer(db, "Beta", { ...it, kind: "staffing_agency" });
  upsertCompanyFromOffer(db, "Gamma", it);
  upsertCompanyFromOffer(db, "Delta", { ...it, sector: "healthcare" });
  return db;
}

test("companies list their live offers, best first, and flag offers from the latest run", () => {
  const db = companiesSetup();
  const all = listCompanies(db);
  expect(all.map((c) => c.name)).toEqual(["Acme", "Beta", "Delta", "Gamma"]);
  const [acme, beta, delta, gamma] = all;
  expect(acme!.offers.map((o) => o.title)).toEqual(["Analyst", "PM"]);
  expect(acme!.best_fit_score).toBe(80);
  expect(acme!.new_offer).toBe(true);
  expect(beta!.new_offer).toBe(false);
  expect(gamma!.offers).toEqual([]);
  expect(delta!.last_posted).toBeNull();
});

test("companies filter by sector, kind and location", () => {
  const db = companiesSetup();
  const names = (f: Parameters<typeof listCompanies>[1]) =>
    listCompanies(db, f).map((c) => c.name);
  expect(names({ sector: "healthcare" })).toEqual(["Delta"]);
  expect(names({ kind: "staffing_agency" })).toEqual(["Beta"]);
  expect(names({ kind: "end_client", size: "sme" })).toEqual([
    "Acme",
    "Delta",
    "Gamma",
  ]);
  expect(names({ location: "modena" })).toEqual(["Acme"]);
  expect(names({ location: "rimini" })).toEqual([]);
});

test("the watch star toggles and reports unknown companies", () => {
  const db = companiesSetup();
  expect(toggleWatched(db, "beta")).toBe(true);
  expect(listCompanies(db).find((c) => c.name === "Beta")!.watched).toBe(true);
  expect(toggleWatched(db, "beta")).toBe(false);
  expect(toggleWatched(db, "nobody")).toBeNull();
});

test("companyKey drops case, accents and legal suffixes", () => {
  expect(companyKey("Società Rossi S.r.l.")).toBe("societa rossi");
  expect(companyKey("ACME, S.p.A.")).toBe(companyKey("Acme"));
});

test("a known size or kind is never replaced by unknown", () => {
  const db = openDb(":memory:");
  upsertCompanyFromOffer(db, "Acme S.r.l.", {
    sector: "manufacturing",
    size: "sme",
    kind: "end_client",
  });
  upsertCompanyFromOffer(db, "ACME", {
    sector: "it_software",
    size: "unknown",
    kind: "unknown",
  });
  expect(getCompany(db, "acme")).toMatchObject({
    name: "Acme S.r.l.",
    sector: "it_software",
    size: "sme",
    kind: "end_client",
    origin: "offer",
  });

  upsertCompanyFromOffer(db, "Acme", {
    sector: "it_software",
    size: "large",
    kind: "it_consultancy",
  });
  expect(getCompany(db, "Acme")).toMatchObject({
    size: "large",
    kind: "it_consultancy",
  });
});

test("an offer never clears watched or changes a searched company's origin", () => {
  const db = openDb(":memory:");
  db.run(
    "INSERT INTO companies (key, name, origin, watched) VALUES ('beta', 'Beta', 'search', 1)",
  );
  upsertCompanyFromOffer(db, "Beta", {
    sector: "consulting",
    size: "unknown",
    kind: "unknown",
  });
  expect(getCompany(db, "Beta")).toMatchObject({
    origin: "search",
    watched: 1,
    sector: "consulting",
    size: "unknown",
    kind: "unknown",
  });
});

test("values outside the fixed lists are refused", () => {
  const db = openDb(":memory:");
  expect(() =>
    upsertCompanyFromOffer(db, "Gamma", {
      sector: "space" as "other",
      size: "sme",
      kind: "end_client",
    }),
  ).toThrow("CHECK");
});

import { expect, test } from "bun:test";
import { getCompany, upsertCompanyFromOffer } from "./companies.ts";
import { openDb } from "./migrate.ts";
import { companyKey } from "./offers.ts";

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

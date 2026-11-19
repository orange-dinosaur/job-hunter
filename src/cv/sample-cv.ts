import type { MasterCv } from "./schema.ts";

// A small valid master CV for tests.
export const sampleCv: MasterCv = {
  personal: {
    name: "Mario Rossi",
    email: "mario@example.com",
    phone: null,
    location: "Bologna",
    links: [{ label: "LinkedIn", url: "linkedin.com/in/mario" }],
  },
  headline: "Sviluppatore backend",
  summary: null,
  experience: [
    {
      role: "Sviluppatore",
      company: "Acme",
      place: "Bologna",
      start: "2020-03",
      end: null,
      bullets: ["Sviluppo di API in TypeScript"],
    },
  ],
  skills: [{ group: "Linguaggi", items: ["TypeScript", "SQL"] }],
  education: [
    {
      degree: "Laurea in Informatica",
      institution: "Università di Bologna",
      place: null,
      start: "2015",
      end: "2019",
      details: [],
    },
  ],
  languages: [{ language: "Inglese", level: "B2" }],
  certifications: [],
  projects: [{ name: "Portale interno", description: null }],
  other: ["Patente di guida B"],
};

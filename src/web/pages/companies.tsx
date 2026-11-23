import { useEffect, useState } from "react";
import type { CompanySummary } from "../../db/companies.ts";
import type { Band } from "../../scoring.ts";
import type { SearchOperation } from "../../server/api/runs.ts";
import { OperationNotice } from "./offer-detail.tsx";

const POLL_MS = 3000;

const active = (op: SearchOperation | null) =>
  op?.status === "queued" || op?.status === "running";

type Company = Omit<CompanySummary, "offers"> & {
  offers: (CompanySummary["offers"][number] & { band: Band | null })[];
};

const sectorLabels: Record<string, string> = {
  it_software: "IT and software",
  manufacturing: "Manufacturing",
  consulting: "Consulting",
  public_administration: "Public administration",
  banking_insurance: "Banking and insurance",
  utilities_energy: "Utilities and energy",
  retail_consumer: "Retail and consumer",
  healthcare: "Healthcare",
  logistics: "Logistics",
  other: "Other",
};
const sizeLabels: Record<string, string> = {
  startup: "Startup",
  sme: "Small or medium",
  large: "Large",
  unknown: "Unknown",
};
const kindLabels: Record<string, string> = {
  end_client: "End client",
  it_consultancy: "IT consultancy",
  staffing_agency: "Staffing agency",
  public_body: "Public body",
  unknown: "Unknown",
};

// Kept outside the component so the filters survive a visit to an offer.
const filters = { sector: "", size: "", kind: "", location: "" };

export function CompaniesPage(props: { navigate: (path: string) => void }) {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [f, setF] = useState(filters);
  const [search, setSearch] = useState<SearchOperation | null>(null);
  // Bumped when a search ends, to load the list again.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    Object.assign(filters, f);
    const q = new URLSearchParams(
      Object.entries(f).filter(([, v]) => v.trim()),
    );
    fetch(`/api/companies?${q}`)
      .then((r) => r.json())
      .then(setCompanies);
  }, [f, reloads]);

  useEffect(() => {
    fetch("/api/companies/search")
      .then((r) => r.json())
      .then(setSearch);
  }, []);

  // Poll while a search runs, then reload the list once it ends.
  useEffect(() => {
    if (!active(search)) return;
    const timer = setTimeout(async () => {
      const next: SearchOperation = await (
        await fetch("/api/companies/search")
      ).json();
      setSearch(next);
      if (!active(next)) setReloads((n) => n + 1);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const findCompanies = async () =>
    setSearch(
      await (await fetch("/api/companies/search", { method: "POST" })).json(),
    );

  const star = async (key: string) => {
    const r = await fetch(`/api/companies/${encodeURIComponent(key)}/watch`, {
      method: "POST",
    });
    const { watched } = await r.json();
    setCompanies((cs) =>
      cs!.map((c) => (c.key === key ? { ...c, watched } : c)),
    );
  };

  const select = (
    name: "sector" | "size" | "kind",
    label: string,
    labels: Record<string, string>,
  ) => (
    <label>
      {label}{" "}
      <select
        value={f[name]}
        onChange={(e) => setF({ ...f, [name]: e.target.value })}
      >
        <option value="">All</option>
        {Object.entries(labels).map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  // Watched first; the API already sorts by best fit score.
  const shown = companies
    ? [...companies].sort((a, b) => Number(b.watched) - Number(a.watched))
    : [];

  return (
    <div className="fill">
      <div className="toolbar">
        <h1>Companies</h1>
        <button onClick={findCompanies} disabled={active(search)}>
          Find companies
        </button>
      </div>
      <OperationNotice
        op={search}
        what="company search"
        doing="web searches for companies near your places"
        saved
      />
      <div className="filters">
        {select("sector", "Sector", sectorLabels)}
        {select("size", "Size", sizeLabels)}
        {select("kind", "Kind", kindLabels)}
        <label>
          Location{" "}
          <input
            value={f.location}
            onChange={(e) => setF({ ...f, location: e.target.value })}
          />
        </label>
        {companies && (
          <span className="muted">{companies.length} companies</span>
        )}
      </div>

      {!companies ? (
        <p className="muted">Loading…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th></th>
                <th>Company</th>
                <th>Sector</th>
                <th>Size</th>
                <th>Kind</th>
                <th>Town</th>
                <th>Best</th>
                <th>Offers</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.key}>
                  <td>
                    <button
                      className="link"
                      title={c.watched ? "Stop watching" : "Watch"}
                      aria-pressed={c.watched}
                      onClick={() => star(c.key)}
                    >
                      {c.watched ? "★" : "☆"}
                    </button>
                  </td>
                  <td>
                    {c.name}
                    {c.watched && c.new_offer && (
                      <strong className="error-text"> New offer</strong>
                    )}
                    {c.reason && <div className="muted">{c.reason}</div>}
                  </td>
                  <td>{sectorLabels[c.sector] ?? "–"}</td>
                  <td>{sizeLabels[c.size] ?? "–"}</td>
                  <td>{kindLabels[c.kind] ?? "–"}</td>
                  <td>{c.town ?? ""}</td>
                  <td>
                    {c.best_fit_score ?? ""}
                    {c.offers[0]?.band && (
                      <span className="muted"> {c.offers[0].band}</span>
                    )}
                  </td>
                  <td>
                    {c.offers.map((o) => (
                      <div key={o.id}>
                        <a
                          href={`/offers/${o.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            props.navigate(`/offers/${o.id}`);
                          }}
                        >
                          {o.title}
                        </a>
                      </div>
                    ))}
                  </td>
                  <td>
                    {c.website && (
                      <a href={c.website} target="_blank" rel="noreferrer">
                        Site
                      </a>
                    )}
                    {c.website && c.careers_url && " · "}
                    {c.careers_url && (
                      <a href={c.careers_url} target="_blank" rel="noreferrer">
                        Careers
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

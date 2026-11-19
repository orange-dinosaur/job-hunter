import { useCallback, useEffect, useState } from "react";
import type { OfferSummary } from "../../db/offers.ts";
import type { SearchRun } from "../../db/runs.ts";
import type { SearchOperation } from "../../server/api/runs.ts";

interface OffersResponse {
  has_cv: boolean;
  run: SearchRun | null;
  offers: (OfferSummary & { kits: string[] })[];
}

const POLL_MS = 3000;

const active = (op: SearchOperation | null) =>
  op?.status === "queued" || op?.status === "running";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "";

// Kept outside the component so the filters survive a visit to an offer.
// ponytail: a page reload resets them; move them into the URL if that matters.
const filters = { minScore: 0, source: "", status: "" };

export function OffersPage(props: { navigate: (path: string) => void }) {
  const [data, setData] = useState<OffersResponse | null>(null);
  const [search, setSearch] = useState<SearchOperation | null>(null);
  const [minScore, setMinScore] = useState(filters.minScore);
  const [source, setSource] = useState(filters.source);
  const [status, setStatus] = useState(filters.status);

  useEffect(() => {
    Object.assign(filters, { minScore, source, status });
  }, [minScore, source, status]);

  const loadOffers = useCallback(async () => {
    setData(await (await fetch("/api/offers")).json());
  }, []);

  useEffect(() => {
    loadOffers();
    fetch("/api/search")
      .then((r) => r.json())
      .then(setSearch);
  }, [loadOffers]);

  // Poll while a search runs, then reload the list once it ends.
  useEffect(() => {
    if (!active(search)) return;
    const timer = setTimeout(async () => {
      const next: SearchOperation = await (await fetch("/api/search")).json();
      setSearch(next);
      if (!active(next)) loadOffers();
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [search, loadOffers]);

  const startSearch = async () =>
    setSearch(await (await fetch("/api/search", { method: "POST" })).json());

  const discard = async (id: string) => {
    await fetch(`/api/offers/${id}/discard`, { method: "POST" });
    loadOffers();
  };

  if (!data) return <p className="muted">Loading…</p>;

  const sources = [...new Set(data.offers.flatMap((o) => o.sources))].sort();
  const statuses = [...new Set(data.offers.map((o) => o.status))].sort();
  const shown = data.offers.filter(
    (o) =>
      (minScore === 0 || (o.fit_score ?? -1) >= minScore) &&
      (!source || o.sources.includes(source)) &&
      (!status || o.status === status),
  );

  return (
    <div className="fill">
      <div className="toolbar">
        <h1>Offers</h1>
        <button onClick={startSearch} disabled={active(search) || !data.has_cv}>
          Run search
        </button>
      </div>

      {active(search) && (
        <p className="notice">
          Search running since {time(search!.started_at)}. The list reloads when
          it finishes.
        </p>
      )}
      {search?.status === "failed" && (
        <p className="notice error">
          The last search failed at {time(search.finished_at)}: {search.error}
        </p>
      )}

      {!data.has_cv && (
        <p className="notice">
          There is no master CV yet, so offers cannot be scored. Import one on
          the{" "}
          <a
            href="/cv"
            onClick={(e) => {
              e.preventDefault();
              props.navigate("/cv");
            }}
          >
            CV page
          </a>
          .
        </p>
      )}

      {!data.run ? (
        <p className="muted">No search has run yet.</p>
      ) : (
        <>
          <p className="muted">
            Search run {data.run.id}, {time(data.run.started_at)}:{" "}
            {data.run.offers_found} offers, {data.run.offers_new} new.
            {data.run.status === "running" && " Still running."}
            {data.run.sources_failed.length > 0 &&
              ` Failed sources: ${data.run.sources_failed
                .map((f) => `${f.source} (${f.error})`)
                .join(", ")}.`}
          </p>

          <div className="filters">
            <label>
              Minimum score{" "}
              <input
                type="number"
                min={0}
                max={100}
                step={5}
                value={minScore}
                onChange={(e) => setMinScore(Number(e.target.value))}
              />
            </label>
            <label>
              Source{" "}
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
              >
                <option value="">All</option>
                {sources.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Status{" "}
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All</option>
                {statuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <span className="muted">
              {shown.length} of {data.offers.length}
            </span>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th className="num">Score</th>
                  <th>Company</th>
                  <th>Title</th>
                  <th>Locations</th>
                  <th>Sources</th>
                  <th className="num">Gaps</th>
                  <th>Status</th>
                  <th>Kit</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={o.id}>
                    <td className="num">
                      {o.dealbreaker ? (
                        <span className="muted" title={o.dealbreaker}>
                          excluded
                        </span>
                      ) : (
                        (o.fit_score ?? <span className="muted">unscored</span>)
                      )}
                    </td>
                    <td>{o.company}</td>
                    <td>
                      <a
                        href={`/offers/${o.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          props.navigate(`/offers/${o.id}`);
                        }}
                      >
                        {o.title}
                      </a>
                    </td>
                    <td>{o.locations.join("; ")}</td>
                    <td>{o.sources.join(", ")}</td>
                    <td className="num">{o.gap_count}</td>
                    <td>{o.status}</td>
                    <td>{o.kits.join(", ")}</td>
                    <td>
                      <button className="link" onClick={() => discard(o.id)}>
                        Discard
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

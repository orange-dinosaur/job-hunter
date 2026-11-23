import { useEffect, useState } from "react";
import type { AgentResponse, Total } from "../../server/api/agent.ts";

const labels: Record<string, string> = {
  search_run: "Search run",
  cv_import: "CV import",
  application_kit: "Application kit",
  cover_letter: "Cover letter",
  cv_suggestion: "CV suggestion",
  rescore: "Rescore",
  follow_up: "Follow-up",
};

const usd = (n: number | null) => (n == null ? "–" : `$${n.toFixed(2)}`);
const count = (n: number | null) => (n == null ? "–" : n.toLocaleString());
const seconds = (ms: number | null) =>
  ms == null ? "–" : `${Math.round(ms / 1000)} s`;

function Totals(props: { title: string; rows: Total[]; label?: boolean }) {
  return (
    <div>
      <h3>{props.title}</h3>
      {props.rows.length === 0 ? (
        <p className="muted">None yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th></th>
              <th className="num">Runs</th>
              <th className="num">Tokens</th>
              <th className="num">Cost</th>
            </tr>
          </thead>
          <tbody>
            {props.rows.map((r) => (
              <tr key={r.key}>
                <td>{props.label ? (labels[r.key] ?? r.key) : r.key}</td>
                <td className="num">{r.count}</td>
                <td className="num">{count(r.tokens)}</td>
                <td className="num">{usd(r.cost_usd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export function AgentPage(props: { navigate: (path: string) => void }) {
  const [data, setData] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/agent")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) return <p className="muted">Loading…</p>;

  const setModel = async (type: string, model: string) => {
    setError(null);
    const r = await fetch("/api/agent/models", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, model }),
    });
    const body = await r.json();
    if (r.ok) setData(body);
    else setError(body.error);
  };

  return (
    <>
      <h1>AI Agent</h1>

      <h2>Models</h2>
      <p className="muted">The next operation of each type uses this model.</p>
      <table className="narrow">
        <tbody>
          {data.models.map((m) => (
            <tr key={m.type}>
              <td>{labels[m.type] ?? m.type}</td>
              <td>
                <select
                  value={m.model}
                  onChange={(e) => setModel(m.type, e.target.value)}
                >
                  {data.choices.map((c) => (
                    <option key={c} value={c}>
                      {c}
                      {c === m.default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {error && <p className="notice error">{error}</p>}

      <h2>Usage</h2>
      <p className="muted">
        On a subscription, cost is what the same tokens would cost at API
        prices. It shows relative usage, not a bill.
      </p>
      <div className="totals">
        <Totals title="By day" rows={data.totals.day} />
        <Totals title="By month" rows={data.totals.month} />
        <Totals title="By operation" rows={data.totals.type} label />
      </div>

      <h2>Operations</h2>
      {data.operations.length === 0 ? (
        <p className="muted">
          No operations yet. Run a search from the Offers page.
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Operation</th>
              <th>Offer</th>
              <th>Model</th>
              <th>Status</th>
              <th className="num">Input</th>
              <th className="num">Output</th>
              <th className="num">Cache read</th>
              <th className="num">Cache write</th>
              <th className="num">Cost</th>
              <th className="num">Duration</th>
            </tr>
          </thead>
          <tbody>
            {data.operations.map((o) => (
              <tr key={o.id}>
                <td>
                  {o.started_at
                    ? new Date(o.started_at).toLocaleString()
                    : "queued"}
                </td>
                <td>{labels[o.type] ?? o.type}</td>
                <td>
                  {o.offer_id && (
                    <a
                      href={`/offers/${o.offer_id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        props.navigate(`/offers/${o.offer_id}`);
                      }}
                    >
                      {o.offer_title ?? o.offer_id}
                    </a>
                  )}
                </td>
                <td>{o.model}</td>
                <td title={o.error ?? undefined}>{o.status}</td>
                <td className="num">{count(o.input_tokens)}</td>
                <td className="num">{count(o.output_tokens)}</td>
                <td className="num">{count(o.cache_read_tokens)}</td>
                <td className="num">{count(o.cache_creation_tokens)}</td>
                <td className="num">{usd(o.cost_usd)}</td>
                <td className="num">{seconds(o.duration_ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

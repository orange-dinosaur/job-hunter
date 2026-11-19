import { useEffect, useState } from "react";
import { offerStatuses } from "../../db/offers.ts";
import type { OfferDetail } from "../../server/api/offer.ts";

export function OfferDetailPage(props: {
  id: string;
  navigate: (path: string) => void;
}) {
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const show = (o: OfferDetail) => {
    setOffer(o);
    setStatus(o.status);
    setNote(o.status_note ?? "");
  };

  useEffect(() => {
    fetch(`/api/offers/${props.id}`).then(async (r) =>
      r.ok ? show(await r.json()) : setMissing(true),
    );
  }, [props.id]);

  if (missing) return <p className="muted">There is no offer {props.id}.</p>;
  if (!offer) return <p className="muted">Loading…</p>;

  const save = async () => {
    setSaveError(null);
    const r = await fetch(`/api/offers/${props.id}/status`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, note }),
    });
    const body = await r.json();
    if (r.ok) show(body);
    else setSaveError(body.error);
  };

  const changed = status !== offer.status || note !== (offer.status_note ?? "");
  const weights: Record<string, number> = offer.weights;
  const scored = new Map(offer.scores.map((s) => [s.criterion, s]));
  const scoredWeight = offer.scores.reduce(
    (sum, s) => sum + (weights[s.criterion] ?? 0),
    0,
  );
  const criteria = Object.entries(weights).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <div className="sticky-head">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            props.navigate("/");
          }}
        >
          ← All offers
        </a>
        <h1>{offer.title}</h1>
        <p>
          {offer.company} · {offer.locations.join("; ")}
          {offer.remote && " · remote"}
          <br />
          <span className="muted">
            Found on {offer.sources.join(", ")}
            {offer.posted_at && `, posted ${offer.posted_at}`}
            {offer.salary_text && ` · ${offer.salary_text}`}
          </span>
          {offer.url && (
            <>
              {" · "}
              <a href={offer.url} target="_blank" rel="noreferrer">
                Original posting
              </a>
            </>
          )}
        </p>
      </div>

      <div className="toolbar">
        <div className="filters">
          <label>
            Status{" "}
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {offerStatuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
          <label>
            Note{" "}
            <input
              className="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button onClick={save} disabled={!changed}>
            Save
          </button>
        </div>
        <div className="filters">
          <button disabled title="Not available yet">
            Prepare
          </button>
          <button disabled title="Not available yet">
            Cover letter
          </button>
        </div>
      </div>
      {saveError && <p className="notice error">{saveError}</p>}

      <h2>
        Fit score{" "}
        {offer.dealbreaker ? "excluded" : (offer.fit_score ?? "unscored")}
      </h2>
      {offer.dealbreaker ? (
        <p className="notice">Dealbreaker: {offer.dealbreaker}</p>
      ) : (
        offer.scores.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Criterion</th>
                <th className="num">Score</th>
                <th className="num">Counts for</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {criteria.map(([criterion, weight]) => {
                const s = scored.get(criterion);
                return (
                  <tr key={criterion} className={s ? undefined : "muted"}>
                    <td>{criterion}</td>
                    <td className="num">{s?.score ?? "–"}</td>
                    <td className="num">
                      {s
                        ? `${Math.round((weight / scoredWeight) * 100)}%`
                        : "–"}
                    </td>
                    <td>
                      {s?.reason ??
                        `Not scored: the offer gives no data. Its ${weight}% weight is shared among the others.`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      )}

      {offer.gaps.length > 0 && (
        <>
          <h2>Gaps</h2>
          <ul>
            {offer.gaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </>
      )}

      <h2>Offer text</h2>
      {offer.text ? (
        <pre className="offer-text">{offer.text}</pre>
      ) : (
        <p className="muted">No offer file saved.</p>
      )}
    </>
  );
}

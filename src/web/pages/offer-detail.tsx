import { useCallback, useEffect, useState } from "react";
import type { Lang } from "../../cv/render.ts";
import { offerStatuses } from "../../db/offers.ts";
import type { OfferDetail } from "../../server/api/offer.ts";
import type { SearchOperation } from "../../server/api/runs.ts";

// render.ts holds node:fs, so the browser bundle keeps its own copy.
const langs: readonly Lang[] = ["it", "en"];

const POLL_MS = 3000;

const active = (op: SearchOperation | null) =>
  op?.status === "queued" || op?.status === "running";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "";

export function OfferDetailPage(props: {
  id: string;
  navigate: (path: string) => void;
}) {
  const [offer, setOffer] = useState<OfferDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [lang, setLang] = useState("it");
  const [saveError, setSaveError] = useState<string | null>(null);

  const show = useCallback((o: OfferDetail) => {
    setOffer(o);
    setStatus(o.status);
    setNote(o.status_note ?? "");
  }, []);

  useEffect(() => {
    fetch(`/api/offers/${props.id}`).then(async (r) => {
      if (!r.ok) return setMissing(true);
      const o: OfferDetail = await r.json();
      show(o);
      if (langs.some((l) => l === o.language)) setLang(o.language!);
    });
  }, [props.id, show]);

  // Poll while a kit or letter runs. Status edits in progress are kept until both end.
  const running = (o: OfferDetail | null) =>
    active(o?.kit_operation ?? null) || active(o?.letter_operation ?? null);
  useEffect(() => {
    if (!running(offer)) return;
    const timer = setTimeout(async () => {
      const next: OfferDetail = await (
        await fetch(`/api/offers/${props.id}`)
      ).json();
      if (running(next))
        setOffer({
          ...next,
          status: offer!.status,
          status_note: offer!.status_note,
        });
      else show(next);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [offer, props.id, show]);

  if (missing) return <p className="muted">There is no offer {props.id}.</p>;
  if (!offer) return <p className="muted">Loading…</p>;

  const post = async (path: string, body: unknown) => {
    setSaveError(null);
    const r = await fetch(`/api/offers/${props.id}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const res = await r.json();
    if (r.ok) show(res);
    else setSaveError(res.error);
  };

  const save = () => post("status", { status, note });
  const prepare = () => post("prepare", { lang });
  const writeLetter = () => post("cover-letter", { lang });

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
          <label>
            Language{" "}
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              {langs.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button onClick={prepare} disabled={active(offer.kit_operation)}>
            Prepare
          </button>
          <button
            onClick={writeLetter}
            disabled={active(offer.letter_operation)}
          >
            Cover letter
          </button>
        </div>
      </div>
      {saveError && <p className="notice error">{saveError}</p>}
      <OperationNotice
        op={offer.kit_operation}
        what="kit"
        doing="the tailored CV, the steps and the suggestions"
        saved={offer.kits.length > 0}
      />
      <OperationNotice
        op={offer.letter_operation}
        what="cover letter"
        doing="the letter and checking it for AI tells"
        saved={offer.letters.length > 0}
      />

      {offer.letters.map((letter) => (
        <section key={letter.lang}>
          <h2>Cover letter ({letter.lang})</h2>
          <p className="filters">
            {letter.has_pdf && (
              <a
                href={`/api/offers/${offer.id}/letter/${letter.lang}/cover-letter.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Cover letter (PDF)
              </a>
            )}
            <CopyButton text={letter.text} />
          </p>
          <pre className="offer-text">{letter.text}</pre>
        </section>
      ))}

      {offer.kits.map((kit) => (
        <section key={kit.lang}>
          <h2>Application kit ({kit.lang})</h2>
          {kit.has_pdf ? (
            <p>
              <a
                href={`/api/offers/${offer.id}/kit/${kit.lang}/cv.pdf`}
                target="_blank"
                rel="noreferrer"
              >
                Tailored CV (PDF)
              </a>
            </p>
          ) : (
            <p className="muted">The tailored CV was not rendered.</p>
          )}
          <h3>Steps to apply</h3>
          {kit.steps ? (
            <pre className="offer-text">{kit.steps}</pre>
          ) : (
            <p className="muted">No steps saved.</p>
          )}
          <h3>CV suggestions</h3>
          {kit.suggestions.length > 0 ? (
            <ul>
              {kit.suggestions.map((s, i) => (
                <li key={i}>{s.text}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">None for this offer.</p>
          )}
        </section>
      ))}

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

export function OperationNotice(props: {
  op: SearchOperation | null;
  what: string;
  doing: string;
  saved: boolean;
}) {
  const { op, what } = props;
  if (!op) return null;
  if (active(op))
    return (
      <p className="notice">
        Working on the {what} since {time(op.started_at)}. Claude is writing{" "}
        {props.doing}. This takes a few minutes.
      </p>
    );
  if (op.status === "failed")
    return (
      <p className="notice error">
        The {what} failed at {time(op.finished_at)}: {op.error}
      </p>
    );
  return props.saved ? (
    <p className="notice">
      The {what} was ready at {time(op.finished_at)}. It is below.
    </p>
  ) : (
    <p className="notice error">
      The {what} run finished at {time(op.finished_at)} but saved nothing.
    </p>
  );
}

function CopyButton(props: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(props.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return <button onClick={copy}>{copied ? "Copied" : "Copy text"}</button>;
}

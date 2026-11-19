import { useCallback, useEffect, useRef, useState } from "react";
import type { CvState } from "../../server/api/cv.ts";
import type { SearchOperation } from "../../server/api/runs.ts";
import { CvEditor } from "./cv-editor.tsx";

type Json = Parameters<typeof CvEditor>[0]["value"];

const POLL_MS = 3000;

const active = (op: SearchOperation | null) =>
  op?.status === "queued" || op?.status === "running";

const time = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : "";

export function CvPage() {
  const [data, setData] = useState<CvState | null>(null);
  const [draft, setDraft] = useState<Json>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const show = useCallback((state: CvState) => {
    setData(state);
    setDraft((state.current?.cv ?? null) as Json);
    setDirty(false);
  }, []);

  // Every endpoint answers with the whole CV state, or with an error.
  const call = async (url: string, init?: RequestInit) => {
    setError(null);
    const r = await fetch(url, init);
    const body = await r.json();
    if (r.ok) show(body);
    else setError(body.error);
  };

  useEffect(() => {
    fetch("/api/cv")
      .then((r) => r.json())
      .then(show);
  }, [show]);

  // Poll while an import runs. Edits in progress are kept until it ends.
  useEffect(() => {
    if (!active(data?.import ?? null)) return;
    const timer = setTimeout(async () => {
      const next: CvState = await (await fetch("/api/cv")).json();
      if (active(next.import)) setData({ ...data!, import: next.import });
      else show(next);
    }, POLL_MS);
    return () => clearTimeout(timer);
  }, [data, show]);

  if (!data) return <p className="muted">Loading…</p>;

  const { current, changes } = data;
  const importing = active(data.import);
  const importLeftNoVersion =
    data.import?.status === "succeeded" &&
    (!current || current.created_at < (data.import.started_at ?? ""));

  const upload = (file: File) => {
    const form = new FormData();
    form.append("file", file);
    call("/api/cv/import", { method: "POST", body: form });
  };

  const save = () =>
    call(`/api/cv/${current!.version}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });

  return (
    <>
      <div className="toolbar">
        <h1>CV</h1>
        <div>
          <input
            ref={fileInput}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) upload(file);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={importing}
          >
            Import PDF
          </button>
        </div>
      </div>

      {importing && (
        <p className="notice">
          Import running since {time(data.import!.started_at)}. Claude is
          reading the PDF. The new version shows here when it finishes.
        </p>
      )}
      {data.import?.status === "failed" && (
        <p className="notice error">
          The last import failed at {time(data.import.finished_at)}:{" "}
          {data.import.error}
        </p>
      )}
      {importLeftNoVersion && (
        <p className="notice error">
          The last import finished without saving a version. See the AI Agent
          page for the run.
        </p>
      )}
      {error && <p className="notice error">{error}</p>}

      {!current ? (
        <p className="muted">
          No master CV yet. Import your CV as a PDF to start.
        </p>
      ) : (
        <>
          <div className="toolbar">
            <p>
              Version {current.version}, {current.origin}
              {current.origin === "restore" &&
                ` of ${current.origin_ref}`}, {time(current.created_at)}.{" "}
              {current.confirmed ? (
                "Confirmed."
              ) : (
                <strong>Not confirmed yet.</strong>
              )}
            </p>
            <div className="filters">
              {current.confirmed ? (
                <button
                  onClick={() =>
                    call(`/api/cv/${current.version}/restore`, {
                      method: "POST",
                    })
                  }
                >
                  Edit as new version
                </button>
              ) : (
                <>
                  <button onClick={save} disabled={!dirty}>
                    Save changes
                  </button>
                  <button
                    onClick={() =>
                      call(`/api/cv/${current.version}/confirm`, {
                        method: "POST",
                      })
                    }
                    disabled={dirty}
                    title={dirty ? "Save your changes first" : undefined}
                  >
                    Confirm
                  </button>
                </>
              )}
            </div>
          </div>

          {changes && (
            <details className="notice" open>
              <summary>
                {changes.list.length === 0
                  ? `No changes against confirmed version ${changes.against}.`
                  : `${changes.list.length} changes against confirmed version ${changes.against}`}
              </summary>
              {changes.list.length > 0 && (
                <table>
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Before</th>
                      <th>Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changes.list.map((c) => (
                      <tr key={c.field}>
                        <td>{c.field}</td>
                        <td>{c.before ?? <span className="muted">–</span>}</td>
                        <td>{c.after ?? <span className="muted">–</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </details>
          )}

          <div className="cv-split">
            {data.has_pdf ? (
              <iframe
                key={current.version}
                src={`/api/cv/${current.version}/pdf`}
                title="Original CV"
              />
            ) : (
              <p className="muted">No original PDF for this version.</p>
            )}
            <div>
              <CvEditor
                value={draft}
                editable={!current.confirmed}
                onChange={(v) => {
                  setDraft(v);
                  setDirty(true);
                }}
              />
            </div>
          </div>
        </>
      )}

      {data.versions.length > 0 && (
        <>
          <h2>Versions</h2>
          <table>
            <thead>
              <tr>
                <th className="num">Version</th>
                <th>Origin</th>
                <th>Created</th>
                <th>Confirmed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.versions.map((v) => (
                <tr key={v.version}>
                  <td className="num">{v.version}</td>
                  <td>
                    {v.origin}
                    {v.origin === "restore" && ` of ${v.origin_ref}`}
                  </td>
                  <td>{time(v.created_at)}</td>
                  <td>{v.confirmed ? "yes" : "no"}</td>
                  <td>
                    {v.version !== current?.version && (
                      <button
                        className="link"
                        onClick={() =>
                          call(`/api/cv/${v.version}/restore`, {
                            method: "POST",
                          })
                        }
                      >
                        Restore
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

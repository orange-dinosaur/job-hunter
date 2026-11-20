import { useEffect, useState } from "react";
import { criteria, type SearchProfile } from "../../profile/schema.ts";
import type { ProfileState } from "../../server/api/profile.ts";

// The form keeps lists as one item per line, and numbers as typed.
interface Form {
  roles: string;
  places: { place: string; radius_km: string }[];
  remote: boolean;
  salary_floor: string;
  contract_types: string;
  languages: string;
  excluded_companies: string;
  excluded_sectors: string;
  dealbreakers: string;
  weights: Record<string, string>;
}

const lines = (s: string) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

function toForm(p: SearchProfile): Form {
  return {
    roles: p.roles.join("\n"),
    places: p.locations.flatMap((l) =>
      l === "remote"
        ? []
        : [{ place: l.place, radius_km: String(l.radius_km) }],
    ),
    remote: p.locations.includes("remote"),
    salary_floor: p.salary_floor == null ? "" : String(p.salary_floor),
    contract_types: p.contract_types.join("\n"),
    languages: p.languages.join("\n"),
    excluded_companies: p.excluded_companies.join("\n"),
    excluded_sectors: p.excluded_sectors.join("\n"),
    dealbreakers: p.dealbreakers.join("\n"),
    weights: Object.fromEntries(
      Object.entries(p.weights).map(([k, v]) => [k, String(v)]),
    ),
  };
}

// Numbers that do not parse are sent as typed, so the server names the field.
const num = (s: string) => (s.trim() === "" || isNaN(+s) ? s : +s);

function fromForm(f: Form) {
  return {
    roles: lines(f.roles),
    locations: [
      ...f.places
        .filter((p) => p.place.trim())
        .map((p) => ({ place: p.place.trim(), radius_km: num(p.radius_km) })),
      ...(f.remote ? ["remote"] : []),
    ],
    salary_floor: f.salary_floor.trim() === "" ? null : num(f.salary_floor),
    contract_types: lines(f.contract_types),
    languages: lines(f.languages),
    excluded_companies: lines(f.excluded_companies),
    excluded_sectors: lines(f.excluded_sectors),
    weights: Object.fromEntries(
      Object.entries(f.weights).map(([k, v]) => [k, num(v)]),
    ),
    dealbreakers: lines(f.dealbreakers),
  };
}

export function ProfilePage() {
  const [state, setState] = useState<ProfileState | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const show = (s: ProfileState) => {
    setState(s);
    setForm(s.profile ? toForm(s.profile) : null);
  };

  useEffect(() => {
    fetch("/api/profile")
      .then((r) => r.json())
      .then(show);
  }, []);

  if (!state) return <p className="muted">Loading…</p>;
  if (!form)
    return (
      <>
        <h1>Search profile</h1>
        <p className="notice error">
          {state.error}
          {"\n\n"}Fix data/search-profile.yaml by hand, then reload this page.
        </p>
      </>
    );

  const set = (patch: Partial<Form>) => {
    setForm({ ...form, ...patch });
    setSaved(false);
  };

  const save = async () => {
    setError(null);
    const r = await fetch("/api/profile", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      // Fields the form does not show yet are sent back as loaded.
      body: JSON.stringify({ ...state?.profile, ...fromForm(form) }),
    });
    const body = await r.json();
    if (r.ok) {
      show(body);
      setSaved(true);
    } else setError(body.error);
  };

  const sum = Object.values(form.weights).reduce((a, v) => a + (+v || 0), 0);

  const list = (key: keyof Form, label: string, hint: string) => (
    <label className="field">
      <span>{label}</span>
      <textarea
        rows={3}
        value={form[key] as string}
        onChange={(e) => set({ [key]: e.target.value })}
      />
      <span className="muted">{hint}</span>
    </label>
  );

  return (
    <>
      <div className="toolbar">
        <h1>Search profile</h1>
        <div className="filters">
          {saved && <span className="muted">Saved.</span>}
          <button onClick={save}>Save</button>
        </div>
      </div>
      {state.is_example && (
        <p className="notice">
          This is still the example profile. Change it to your own targets
          before the next search.
        </p>
      )}
      {error && <p className="notice error">{error}</p>}

      <div className="profile-form">
        {list("roles", "Roles", "Job titles to search for, one per line.")}

        <div className="field">
          <span>Locations</span>
          {form.places.map((p, i) => (
            <div className="filters" key={i}>
              <input
                className="place"
                value={p.place}
                placeholder="Place"
                onChange={(e) =>
                  set({
                    places: form.places.map((q, j) =>
                      j === i ? { ...q, place: e.target.value } : q,
                    ),
                  })
                }
              />
              <label>
                within{" "}
                <input
                  value={p.radius_km}
                  inputMode="numeric"
                  onChange={(e) =>
                    set({
                      places: form.places.map((q, j) =>
                        j === i ? { ...q, radius_km: e.target.value } : q,
                      ),
                    })
                  }
                />{" "}
                km
              </label>
              <button
                className="link"
                onClick={() =>
                  set({ places: form.places.filter((_, j) => j !== i) })
                }
              >
                Remove
              </button>
            </div>
          ))}
          <div className="filters">
            <button
              className="link"
              onClick={() =>
                set({
                  places: [...form.places, { place: "", radius_km: "30" }],
                })
              }
            >
              Add a place
            </button>
            <label>
              <input
                type="checkbox"
                checked={form.remote}
                onChange={(e) => set({ remote: e.target.checked })}
              />{" "}
              Remote
            </label>
          </div>
        </div>

        <label className="field">
          <span>Salary floor</span>
          <input
            className="salary"
            value={form.salary_floor}
            inputMode="numeric"
            onChange={(e) => set({ salary_floor: e.target.value })}
          />
          <span className="muted">
            Lowest yearly gross salary in EUR. Leave empty for no floor.
          </span>
        </label>

        {list(
          "contract_types",
          "Contract types",
          "For example permanent, fixed-term. One per line.",
        )}
        {list(
          "languages",
          "Languages",
          "Two-letter codes an offer may be written in, such as it or en.",
        )}
        {list("excluded_companies", "Excluded companies", "One per line.")}
        {list("excluded_sectors", "Excluded sectors", "One per line.")}
        {list(
          "dealbreakers",
          "Dealbreakers",
          "Rules that exclude an offer outright, one per line.",
        )}

        <div className="field">
          <span>Weights</span>
          <table>
            <tbody>
              {criteria.map((c) => (
                <tr key={c}>
                  <td>{c}</td>
                  <td className="num">
                    <input
                      value={form.weights[c] ?? ""}
                      inputMode="numeric"
                      onChange={(e) =>
                        set({
                          weights: { ...form.weights, [c]: e.target.value },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
              <tr>
                <td>Total</td>
                <td className={sum === 100 ? "num" : "num error-text"}>
                  {sum}
                </td>
              </tr>
            </tbody>
          </table>
          <span className="muted">
            How much each criterion counts in the fit score. Must sum to 100.
            The next search uses the saved weights.
          </span>
        </div>
      </div>
    </>
  );
}

// A form for any JSON shaped like the master CV: objects become labelled
// fields, lists get add and remove buttons, and an empty field means null.

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

// What a new list item looks like, by the name of the list.
const blanks: Record<string, Json> = {
  links: { label: null, url: null },
  experience: {
    role: null,
    company: null,
    place: null,
    start: null,
    end: null,
    bullets: [],
  },
  skills: { group: null, items: [] },
  education: {
    degree: null,
    institution: null,
    place: null,
    start: null,
    end: null,
    details: [],
  },
  languages: { language: null, level: null },
  certifications: { name: null, issuer: null, date: null },
  projects: { name: null, description: null },
};

const label = (key: string) =>
  key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");

function Text(props: {
  value: Json;
  onChange: (v: Json) => void;
  editable: boolean;
  long: boolean;
}) {
  const text = props.value == null ? "" : String(props.value);
  if (!props.editable)
    return text ? <span>{text}</span> : <span className="muted">–</span>;
  const set = (v: string) => props.onChange(v === "" ? null : v);
  return props.long || text.length > 70 ? (
    <textarea
      value={text}
      rows={Math.max(2, Math.ceil(text.length / 80))}
      onChange={(e) => set(e.target.value)}
    />
  ) : (
    <input value={text} onChange={(e) => set(e.target.value)} />
  );
}

export function CvEditor(props: {
  value: Json;
  onChange: (v: Json) => void;
  editable: boolean;
  name?: string;
}) {
  const { value, onChange, editable, name = "" } = props;

  if (Array.isArray(value)) {
    const blank = blanks[name] ?? null;
    return (
      <div className="cv-list">
        {value.length === 0 && !editable && <span className="muted">–</span>}
        {value.map((item, i) => (
          <div key={i} className="cv-item">
            <CvEditor
              value={item}
              name={name}
              editable={editable}
              onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))}
            />
            {editable && (
              <button
                className="link"
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            )}
          </div>
        ))}
        {editable && (
          <button
            className="link"
            onClick={() => onChange([...value, structuredClone(blank)])}
          >
            Add
          </button>
        )}
      </div>
    );
  }

  if (value && typeof value === "object")
    return (
      <div className="cv-fields">
        {Object.entries(value).map(([key, v]) => (
          // A div, not a label: clicking a label would press the first button inside it.
          <div key={key} className="cv-field">
            <span className="muted">{label(key)}</span>
            <CvEditor
              value={v}
              name={key}
              editable={editable}
              onChange={(nv) => onChange({ ...value, [key]: nv })}
            />
          </div>
        ))}
      </div>
    );

  return (
    <Text
      value={value}
      onChange={onChange}
      editable={editable}
      long={["summary", "bullets", "details", "description", "other"].includes(
        name,
      )}
    />
  );
}

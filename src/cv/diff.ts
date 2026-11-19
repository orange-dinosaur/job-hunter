export interface CvChange {
  field: string;
  before: string | null;
  after: string | null;
}

// Flattens a CV into one line per leaf, such as "experience 1 › role".
function flatten(value: unknown, path: string, out: Map<string, string>) {
  if (Array.isArray(value))
    value.forEach((v, i) =>
      flatten(v, path ? `${path} ${i + 1}` : String(i + 1), out),
    );
  else if (value && typeof value === "object")
    for (const [k, v] of Object.entries(value))
      flatten(v, path ? `${path} › ${k}` : k, out);
  else if (value != null) out.set(path, String(value));
  return out;
}

// Field-by-field changes from one CV to another, in the order of the newer one.
export function diffCv(before: unknown, after: unknown): CvChange[] {
  const a = flatten(before, "", new Map());
  const b = flatten(after, "", new Map());
  const changes: CvChange[] = [];
  for (const [field, value] of b)
    if (a.get(field) !== value)
      changes.push({ field, before: a.get(field) ?? null, after: value });
  for (const [field, value] of a)
    if (!b.has(field)) changes.push({ field, before: value, after: null });
  return changes;
}

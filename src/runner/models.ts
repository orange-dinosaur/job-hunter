import type { Database } from "bun:sqlite";

export const operationTypes = [
  "search_run",
  "cv_import",
  "application_kit",
  "cover_letter",
  "cv_suggestion",
] as const;
export type OperationType = (typeof operationTypes)[number];

// The slash command in .claude/commands/ that each operation runs.
export const commandFor: Record<OperationType, string> = {
  search_run: "job-search",
  cv_import: "cv-import",
  application_kit: "job-prepare",
  cover_letter: "cover-letter",
  cv_suggestion: "cv-apply-suggestion",
};

export const defaultModels: Record<OperationType, string> = {
  search_run: "sonnet",
  cv_import: "opus",
  application_kit: "opus",
  cover_letter: "opus",
  cv_suggestion: "sonnet",
};

// Aliases `claude --model` accepts.
export const modelChoices = ["haiku", "sonnet", "opus"] as const;

export const modelSettingKey = (type: OperationType) => `model.${type}`;

export function modelFor(db: Database, type: OperationType): string {
  const row = db
    .query<{ value: string }, [string]>(
      "SELECT value FROM settings WHERE key = ?",
    )
    .get(modelSettingKey(type));
  return row?.value ?? defaultModels[type];
}

import type { Bands } from "./profile/schema.ts";

export type Band = "strong" | "apply" | "maybe" | "skip";

export function bandFor(score: number | null, bands: Bands): Band | null {
  if (score == null) return null;
  if (score >= bands.strong) return "strong";
  if (score >= bands.apply) return "apply";
  if (score >= bands.maybe) return "maybe";
  return "skip";
}

export interface CriterionScore {
  criterion: string;
  score: number;
}

// Weighted mean over the criteria that have both a score and a weight.
// A criterion left unscored drops out and its weight is shared among the rest.
export function fitScore(
  scores: CriterionScore[],
  weights: Record<string, number>,
): number | null {
  let sum = 0;
  let total = 0;
  for (const { criterion, score } of scores) {
    const weight = weights[criterion];
    if (!weight) continue;
    sum += score * weight;
    total += weight;
  }
  return total ? Math.round(sum / total) : null;
}

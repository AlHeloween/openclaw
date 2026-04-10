export type VectorSearchResult = {
  id: string;
  text: string;
  textScore: number;
  multiScore?: number;
  score: number;
  modality?: string;
  media?: Record<string, unknown>;
  importance?: number;
  category?: string;
  createdAt?: number;
};

export type FusionWeights = {
  text: number;
  multi: number;
};

export const DEFAULT_FUSION_WEIGHTS: FusionWeights = {
  text: 0.6,
  multi: 0.4,
};

export function fuseScores(
  textResults: Array<{ id: string; score: number }>,
  multiResults: Array<{ id: string; score: number }>,
  weights: FusionWeights = DEFAULT_FUSION_WEIGHTS,
): VectorSearchResult[] {
  const byId = new Map<
    string,
    { id: string; textScore: number; multiScore?: number; score: number }
  >();

  for (const r of textResults) {
    byId.set(r.id, {
      id: r.id,
      textScore: r.score,
      score: r.score * weights.text,
    });
  }

  for (const r of multiResults) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.multiScore = r.score;
      existing.score = existing.textScore * weights.text + r.score * weights.multi;
    } else {
      byId.set(r.id, {
        id: r.id,
        textScore: 0,
        multiScore: r.score,
        score: r.score * weights.multi,
      });
    }
  }

  return [...byId.values()]
    .toSorted((a, b) => b.score - a.score)
    .map((r) => ({
      ...r,
      text: "",
    }));
}

export function rankResults(results: VectorSearchResult[], minScore: number): VectorSearchResult[] {
  return results.filter((r) => r.score >= minScore).toSorted((a, b) => b.score - a.score);
}

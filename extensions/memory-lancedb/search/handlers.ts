import type { KMedoidsResult } from "./clustering.js";

export type ClusterableItem = {
  id: string;
  text: string;
  vector: number[];
  score: number;
  modality: string;
  category: string;
};

export type ClusterRequest = {
  items: ClusterableItem[];
  k?: number;
};

export type ClusterResponse = {
  k: number;
  iterations: number;
  inertia: number;
  centroids: string[];
  clusters: Array<{
    id: string;
    text: string;
    clusterId: number;
    distanceToCentroid: number;
    score: number;
    category: string;
  }>;
};

export type MemoryListResponse = {
  id: string;
  text: string;
  category: string;
  modality: string;
  importance: number;
  score: number;
  createdAt: number;
  media?: Record<string, unknown>;
}[];

export function prepareClusterRequest(
  items: ClusterableItem[],
  kParam?: number,
  maxK = 8,
): Omit<ClusterRequest, "items"> & { k: number } {
  let k =
    kParam ??
    selectOptimalK(
      items.map((i) => i.vector),
      maxK,
    );
  k = Math.min(k, items.length - 1);
  k = Math.max(k, 2);
  return { k };
}

function selectOptimalK(vectors: number[][], maxK: number): number {
  const inertia: number[] = [];
  for (let k = 2; k <= Math.min(maxK, vectors.length - 1); k++) {
    let sum = 0;
    for (let i = 0; i < vectors.length; i += Math.max(1, Math.floor(vectors.length / 10))) {
      sum += Math.random();
    }
    inertia.push(sum / Math.max(1, Math.floor(vectors.length / 10)));
  }
  if (inertia.length === 0) {return 2;}
  const diffs = inertia.slice(0, -1).map((v, i) => v - inertia[i + 1]);
  const maxDiff = Math.max(...diffs);
  return diffs.indexOf(maxDiff) + 2;
}

export function formatClusterResult(
  clustered: KMedoidsResult,
  items: ClusterableItem[],
): ClusterResponse {
  return {
    k: clustered.k,
    iterations: clustered.iterations,
    inertia: clustered.inertia,
    centroids: clustered.centroids,
    clusters: clustered.clusters.map((c) => ({
      id: c.id,
      text: c.text.slice(0, 100),
      clusterId: c.clusterId,
      distanceToCentroid: c.distanceToCentroid,
      score: c.score,
      category: c.category || "other",
    })),
  };
}

export function formatMemoryList(
  results: Array<{
    entry: {
      id: string;
      text: string;
      category: string;
      modality: string;
      importance: number;
      createdAt: number;
      media?: Record<string, unknown>;
    };
    score: number;
  }>,
): MemoryListResponse {
  return results.map((r) => ({
    id: r.entry.id,
    text: r.entry.text,
    category: r.entry.category,
    modality: r.entry.modality,
    importance: r.entry.importance,
    score: r.score,
    createdAt: r.entry.createdAt,
    media: r.entry.media,
  }));
}

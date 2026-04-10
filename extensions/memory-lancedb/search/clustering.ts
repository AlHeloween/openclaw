export interface ClusteredResult {
  id: string;
  text: string;
  clusterId: number;
  distanceToCentroid: number;
  score: number;
  modality?: string;
  category?: string;
}

export interface KMedoidsResult {
  clusters: ClusteredResult[];
  centroids: string[];
  k: number;
  iterations: number;
  inertia: number;
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) {return 1;}
  return 1 - dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function averageDistance(idx: number, medoidIndices: number[], distances: number[][]): number {
  let sum = 0;
  for (const mIdx of medoidIndices) {
    sum += distances[idx][mIdx];
  }
  return sum / medoidIndices.length;
}

function computeDistanceMatrix(vectors: number[][]): number[][] {
  const n = vectors.length;
  const matrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = cosineDistance(vectors[i], vectors[j]);
      matrix[i][j] = d;
      matrix[j][i] = d;
    }
  }
  return matrix;
}

export function kMedoids(vectors: number[][], k: number, maxIterations = 50): KMedoidsResult {
  const n = vectors.length;
  if (k <= 0 || k >= n) {
    throw new Error(`k must be between 1 and ${n - 1}, got ${k}`);
  }

  const distances = computeDistanceMatrix(vectors);

  const medoidIndices: number[] = [];
  const used = new Set<number>();

  let farthestIdx = Math.floor(Math.random() * n);
  medoidIndices.push(farthestIdx);
  used.add(farthestIdx);

  while (medoidIndices.length < k) {
    let maxMinDist = -1;
    let bestIdx = 0;

    for (let i = 0; i < n; i++) {
      if (used.has(i)) {continue;}

      let minDist = Infinity;
      for (const mIdx of medoidIndices) {
        minDist = Math.min(minDist, distances[i][mIdx]);
      }

      if (minDist > maxMinDist) {
        maxMinDist = minDist;
        bestIdx = i;
      }
    }

    medoidIndices.push(bestIdx);
    used.add(bestIdx);
  }

  const assignments = new Map<number, number>();
  let iterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    iterations++;

    for (let i = 0; i < n; i++) {
      if (used.has(i)) {
        assignments.set(i, i);
        continue;
      }

      let bestMedoid = 0;
      let bestDist = Infinity;
      for (let m = 0; m < medoidIndices.length; m++) {
        const d = distances[i][medoidIndices[m]];
        if (d < bestDist) {
          bestDist = d;
          bestMedoid = medoidIndices[m];
        }
      }
      assignments.set(i, bestMedoid);
    }

    let changed = false;

    for (const centroidId of [...medoidIndices]) {
      const clusterMembers: number[] = [];
      for (let i = 0; i < n; i++) {
        if (assignments.get(i) === centroidId) {
          clusterMembers.push(i);
        }
      }

      if (clusterMembers.length === 0) {continue;}

      let bestCost = Infinity;
      let bestMember = centroidId;

      for (const member of clusterMembers) {
        let cost = 0;
        for (const other of clusterMembers) {
          cost += distances[member][other];
        }
        if (cost < bestCost) {
          bestCost = cost;
          bestMember = member;
        }
      }

      if (bestMember !== centroidId) {
        const idx = medoidIndices.indexOf(centroidId);
        medoidIndices[idx] = bestMember;
        used.delete(centroidId);
        used.add(bestMember);
        changed = true;
      }
    }

    if (!changed) {break;}
  }

  const results: ClusteredResult[] = [];
  let inertia = 0;

  for (let i = 0; i < n; i++) {
    const centroidId = assignments.get(i)!;
    const clusterId = medoidIndices.indexOf(centroidId);
    const dist = distances[i][centroidId];
    inertia += dist;

    results.push({
      id: `item-${i}`,
      text: "",
      clusterId,
      distanceToCentroid: dist,
      score: 0,
    });
  }

  return {
    clusters: results,
    centroids: medoidIndices.map((idx) => `item-${idx}`),
    k: medoidIndices.length,
    iterations,
    inertia,
  };
}

export function clusterWithMedoids(
  items: Array<{
    id: string;
    text: string;
    vector: number[];
    score: number;
    modality?: string;
    category?: string;
  }>,
  k: number,
): KMedoidsResult {
  const vectors = items.map((item) => item.vector);
  const base = kMedoids(vectors, k);

  for (let i = 0; i < items.length; i++) {
    base.clusters[i].id = items[i].id;
    base.clusters[i].text = items[i].text;
    base.clusters[i].score = items[i].score;
    base.clusters[i].modality = items[i].modality;
    base.clusters[i].category = items[i].category;
  }

  return base;
}

export function selectOptimalK(vectors: number[][], maxK = 10): number {
  const n = vectors.length;
  const maxPossibleK = Math.min(maxK, Math.floor(n / 2), n - 1);
  if (maxPossibleK < 2) {return 1;}

  let bestK = 2;
  let bestScore = Infinity;

  for (let k = 2; k <= maxPossibleK; k++) {
    try {
      const result = kMedoids(vectors, k, 20);
      const penalty = k * 0.1;
      const score = result.inertia + penalty;
      if (score < bestScore) {
        bestScore = score;
        bestK = k;
      }
    } catch {
      break;
    }
  }

  return bestK;
}

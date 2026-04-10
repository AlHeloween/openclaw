import { describe, test, expect } from "vitest";
import { kMedoids, clusterWithMedoids, selectOptimalK } from "./clustering.js";

describe("k-medoids clustering", () => {
  function makeVectors(n: number, dims = 8): number[][] {
    return Array.from({ length: n }, (_, i) =>
      Array.from({ length: dims }, (_, j) => Math.sin(i + j) * 0.5 + 0.5),
    );
  }

  test("kMedoids returns correct structure", () => {
    const vectors = makeVectors(10);
    const result = kMedoids(vectors, 3);

    expect(result.k).toBe(3);
    expect(result.centroids.length).toBe(3);
    expect(result.clusters.length).toBe(10);
    expect(result.iterations).toBeGreaterThan(0);
    expect(result.inertia).toBeGreaterThanOrEqual(0);
  });

  test("each item is assigned to a cluster", () => {
    const vectors = makeVectors(15);
    const result = kMedoids(vectors, 3);

    for (const item of result.clusters) {
      expect(item.clusterId).toBeGreaterThanOrEqual(0);
      expect(item.clusterId).toBeLessThan(3);
      expect(item.distanceToCentroid).toBeGreaterThanOrEqual(0);
      expect(item.distanceToCentroid).toBeLessThanOrEqual(1);
    }
  });

  test("centroids are valid item indices", () => {
    const vectors = makeVectors(20);
    const result = kMedoids(vectors, 4);

    for (const centroidId of result.centroids) {
      const idx = parseInt(centroidId.replace("item-", ""), 10);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(20);
    }
  });

  test("clusterWithMedoids preserves item metadata", () => {
    const items = [
      {
        id: "a",
        text: "text a",
        vector: [0.1, 0.2, 0.3],
        score: 0.9,
        modality: "text",
        category: "fact",
      },
      {
        id: "b",
        text: "text b",
        vector: [0.4, 0.5, 0.6],
        score: 0.8,
        modality: "image",
        category: "preference",
      },
      {
        id: "c",
        text: "text c",
        vector: [0.7, 0.8, 0.9],
        score: 0.7,
        modality: "audio",
        category: "decision",
      },
    ];

    const result = clusterWithMedoids(items, 2);

    expect(result.clusters.length).toBe(3);
    expect(result.clusters[0].id).toBe("a");
    expect(result.clusters[0].text).toBe("text a");
    expect(result.clusters[0].score).toBe(0.9);
    expect(result.clusters[0].modality).toBe("text");
    expect(result.clusters[0].category).toBe("fact");
  });

  test("selectOptimalK returns reasonable value", () => {
    const vectors = makeVectors(20);
    const k = selectOptimalK(vectors, 5);
    expect(k).toBeGreaterThanOrEqual(1);
    expect(k).toBeLessThanOrEqual(5);
  });

  test("throws for invalid k", () => {
    const vectors = makeVectors(5);
    expect(() => kMedoids(vectors, 0)).toThrow();
    expect(() => kMedoids(vectors, 5)).toThrow();
    expect(() => kMedoids(vectors, 10)).toThrow();
  });

  test("handles edge case k=1", () => {
    const vectors = makeVectors(10);
    const result = kMedoids(vectors, 1);
    expect(result.k).toBe(1);
    expect(result.centroids.length).toBe(1);
    expect(result.clusters.every((c) => c.clusterId === 0)).toBe(true);
  });

  test("converges within max iterations", () => {
    const vectors = makeVectors(30);
    const result = kMedoids(vectors, 5, 100);
    expect(result.iterations).toBeLessThanOrEqual(100);
  });
});

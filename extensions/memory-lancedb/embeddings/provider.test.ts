import { describe, test, expect, vi } from "vitest";
import {
  HarrierEmbeddingProvider,
  OpenAIEmbeddingProvider,
  CompositeEmbeddingProvider,
  type EmbeddingProvider,
} from "./provider.js";

describe("HarrierEmbeddingProvider", () => {
  test("delegates to embedder", async () => {
    const embedder = { embed: vi.fn(async () => [0.1, 0.2, 0.3]) };
    const provider = new HarrierEmbeddingProvider(embedder);
    const result = await provider.embed("hello");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(embedder.embed).toHaveBeenCalledWith("hello");
  });

  test("has correct dimensions and provider", () => {
    const embedder = { embed: vi.fn(async () => []) };
    const provider = new HarrierEmbeddingProvider(embedder);
    expect(provider.dimensions).toBe(1024);
    expect(provider.provider).toBe("harrier");
  });
});

describe("OpenAIEmbeddingProvider", () => {
  test("calls embeddings.create with correct params", async () => {
    const embeddingsCreate = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }));
    const client = { embeddings: { create: embeddingsCreate } };
    const provider = new OpenAIEmbeddingProvider(client, "text-embedding-3-small", 1536);
    const result = await provider.embed("hello");
    expect(result).toEqual([0.1, 0.2, 0.3]);
    expect(embeddingsCreate).toHaveBeenCalledWith({
      model: "text-embedding-3-small",
      input: "hello",
      dimensions: 1536,
    });
  });

  test("uses default dimensions when not specified", async () => {
    const embeddingsCreate = vi.fn(async () => ({
      data: [{ embedding: [0.1, 0.2, 0.3] }],
    }));
    const client = { embeddings: { create: embeddingsCreate } };
    const provider = new OpenAIEmbeddingProvider(client, "text-embedding-3-small");
    expect(provider.dimensions).toBe(1536);
  });

  test("has correct provider string", () => {
    const embeddingsCreate = vi.fn(async () => ({ data: [{ embedding: [] }] }));
    const client = { embeddings: { create: embeddingsCreate } };
    const provider = new OpenAIEmbeddingProvider(client, "text-embedding-3-small");
    expect(provider.provider).toBe("openai");
  });
});

describe("CompositeEmbeddingProvider", () => {
  test("uses primary provider on success", async () => {
    const primary = { embed: vi.fn(async () => [1.0, 2.0]), dimensions: 2, provider: "primary" };
    const provider = new CompositeEmbeddingProvider(primary, null);
    const result = await provider.embed("hello");
    expect(result).toEqual([1.0, 2.0]);
    expect(primary.embed).toHaveBeenCalledTimes(1);
  });

  test("falls back to secondary when primary fails", async () => {
    const primary = {
      embed: vi.fn(async () => {
        throw new Error("primary failed");
      }),
      dimensions: 2,
      provider: "primary",
    };
    const fallback = { embed: vi.fn(async () => [3.0, 4.0]), dimensions: 2, provider: "fallback" };
    const provider = new CompositeEmbeddingProvider(primary, fallback);
    const result = await provider.embed("hello");
    expect(result).toEqual([3.0, 4.0]);
    expect(primary.embed).toHaveBeenCalledTimes(1);
    expect(fallback.embed).toHaveBeenCalledTimes(1);
  });

  test("re-throws when primary fails and no fallback", async () => {
    const primary = {
      embed: vi.fn(async () => {
        throw new Error("primary failed");
      }),
      dimensions: 2,
      provider: "primary",
    };
    const provider = new CompositeEmbeddingProvider(primary, null);
    await expect(provider.embed("hello")).rejects.toThrow("primary failed");
  });

  test("inherits dimensions from primary", () => {
    const primary = { embed: vi.fn(async () => []), dimensions: 768, provider: "primary" };
    const fallback = { embed: vi.fn(async () => []), dimensions: 1536, provider: "fallback" };
    const provider = new CompositeEmbeddingProvider(primary, fallback);
    expect(provider.dimensions).toBe(768);
  });
});

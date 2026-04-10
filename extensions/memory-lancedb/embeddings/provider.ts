export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimensions: number;
  provider: string;
}

export class HarrierEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 1024;
  readonly provider = "harrier";

  constructor(private readonly embedder: { embed(text: string): Promise<number[]> }) {}

  async embed(text: string): Promise<number[]> {
    return this.embedder.embed(text);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly provider = "openai";

  constructor(
    private readonly client: {
      embeddings: {
        create: (params: { model: string; input: string; dimensions?: number }) => Promise<{
          data: Array<{ embedding: number[] }>;
        }>;
      };
    },
    private readonly model: string,
    dimensions?: number,
  ) {
    this.dimensions = dimensions ?? 1536;
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: this.model,
      input: text,
      dimensions: this.dimensions,
    });
    return response.data[0].embedding;
  }
}

export class CompositeEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions: number;
  readonly provider = "composite";

  constructor(
    private readonly primary: EmbeddingProvider,
    private readonly fallback: EmbeddingProvider | null,
  ) {
    this.dimensions = primary.dimensions;
  }

  async embed(text: string): Promise<number[]> {
    try {
      return await this.primary.embed(text);
    } catch (_e) {
      if (this.fallback) {
        return await this.fallback.embed(text);
      }
      throw _e;
    }
  }
}

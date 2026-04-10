import { loadHarrierModel, embedText, dimensions } from "./harrier-impl.js";
import type { HarrierEmbeddingOptions } from "./harrier-impl.js";

export interface TextEmbeddingProvider {
  embed(text: string): Promise<number[]>;
  dimensions: number;
}

export class HarrierEmbeddings implements TextEmbeddingProvider {
  private initPromise: Promise<void> | null = null;

  constructor(private readonly options?: HarrierEmbeddingOptions) {}

  get dimensions(): number {
    return dimensions;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }
    this.initPromise = loadHarrierModel(this.options);
    return this.initPromise;
  }

  async embed(text: string): Promise<number[]> {
    await this.ensureInitialized();
    return await embedText(text);
  }
}

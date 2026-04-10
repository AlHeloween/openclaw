import {
  loadImageBindModel,
  embedText,
  embedImage,
  embedAudio,
  dimensions,
} from "./imagebind-impl.js";
import type { ImageBindOptions } from "./imagebind-impl.js";

export interface MultimodalEmbeddingProvider {
  embedText(text: string): Promise<number[]>;
  embedImage(image: Buffer | string): Promise<number[]>;
  embedAudio(audio: Buffer): Promise<number[]>;
  dimensions: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let initPromise: Promise<any> | null = null;

export class ImageBindEmbeddings implements MultimodalEmbeddingProvider {
  constructor(private readonly options?: ImageBindOptions) {}

  get dimensions(): number {
    return dimensions;
  }

  private async ensureInitialized(): Promise<void> {
    if (initPromise) {
      return initPromise;
    }
    initPromise = loadImageBindModel(this.options);
    return initPromise;
  }

  async embedText(text: string): Promise<number[]> {
    await this.ensureInitialized();
    return await embedText(text);
  }

  async embedImage(image: Buffer | string): Promise<number[]> {
    await this.ensureInitialized();
    return await embedImage(image);
  }

  async embedAudio(audio: Buffer): Promise<number[]> {
    await this.ensureInitialized();
    return await embedAudio(audio);
  }
}

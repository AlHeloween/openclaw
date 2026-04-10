import { homedir } from "node:os";
import path from "node:path";
import { env, pipeline, type ProgressInfo } from "@huggingface/transformers";

const HARRIER_MODEL_ID = "onnx-community/harrier-oss-v1-0.6b-ONNX";
const HARRIER_DEFAULT_DIMENSIONS = 1024;
const HARRIER_FALLBACK_INFO = "Harrier ONNX model requires custom ops. Use OpenAI embeddings or install Python sentence-transformers: pip install sentence-transformers";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let embedder: any = null;
let loadPromise: Promise<void> | null = null;

export interface HarrierEmbeddingOptions {
  progressCallback?: (status: string, progress: number) => void;
}

export async function loadHarrierModel(
  options?: HarrierEmbeddingOptions,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  if (embedder) {
    return embedder;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      env.cacheDir = path.join(homedir(), ".cache", "openclaw-memory-lancedb");

      embedder = await pipeline("feature-extraction", HARRIER_MODEL_ID, {
        progress_callback: options?.progressCallback
          ? (info: ProgressInfo) => {
              if (info.status === "done") {
                options.progressCallback!("done", 1);
              }
            }
          : undefined,
      });
    })().catch((error) => {
      loadPromise = null;
      const msg = `Failed to load Harrier embedding model (${HARRIER_MODEL_ID}). ${HARRIER_FALLBACK_INFO}`;
      throw new Error(msg, { cause: error });
    });
  }

  return await loadPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const model = await loadHarrierModel();
  const result = await model(text, { pooling: "mean", normalize: true });
  const data = result.data as Float32Array;
  return Array.from(data);
}

export const dimensions = HARRIER_DEFAULT_DIMENSIONS;

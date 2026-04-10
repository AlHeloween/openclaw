import * as path from "node:path";
import { homedir, tmpdir } from "node:os";
import fs from "node:fs";

const IMAGEBIND_DEFAULT_DIMENSIONS = 1024;

function getModelCacheDir(): string {
  return path.join(homedir(), ".cache", "openclaw-memory-lancedb");
}

function getCachedModelPath(): string {
  return path.join(getModelCacheDir(), "imagebind_huge.pth");
}

const HF_MODEL_ID = "facebook/imagebind-huge";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let imagebindModule: any = null;
let loadPromise: Promise<void> | null = null;

export interface ImageBindOptions {
  modelPath?: string;
  device?: "cpu" | "cuda";
  progressCallback?: (status: string, progress: number) => void;
}

export async function loadImageBindModel(
  options?: ImageBindOptions,
): Promise<any> {
  if (imagebindModule) {
    return imagebindModule;
  }

  if (!loadPromise) {
    loadPromise = (async () => {
      const { env, pipeline } = await import("@huggingface/transformers");

      const cacheDir = getModelCacheDir();
      env.cacheDir = cacheDir;

      const modelPath = options?.modelPath ?? getCachedModelPath();

      if (fs.existsSync(modelPath)) {
        imagebindModule = await pipeline("feature-extraction", modelPath, {
          progress_callback: options?.progressCallback
            ? (info: { status: string }) => {
                if (info.status === "done") {
                  options.progressCallback!("done", 1);
                }
              }
            : undefined,
        });
      } else {
        imagebindModule = await pipeline("feature-extraction", HF_MODEL_ID, {
          progress_callback: options?.progressCallback
            ? (info: { status: string; progress?: number }) => {
                if (options.progressCallback) {
                  if (info.status === "downloading" && info.progress !== undefined) {
                    options.progressCallback("downloading", info.progress);
                  } else if (info.status === "done") {
                    options.progressCallback("done", 1);
                  }
                }
              }
            : undefined,
        });
      }
    })().catch((error) => {
      loadPromise = null;
      throw error;
    });
  }

  return await loadPromise;
}

export async function embedText(text: string): Promise<number[]> {
  const model = await loadImageBindModel();
  const result = await model(text, { pooling: "mean", normalize: true });
  const data = result.data as Float32Array;
  return Array.from(data);
}

export async function embedImage(image: Buffer | string): Promise<number[]> {
  const model = await loadImageBindModel();

  let imagePath: string;
  if (Buffer.isBuffer(image)) {
    const tempFile = path.join(tmpdir(), `imagebind-${Date.now()}.png`);
    fs.writeFileSync(tempFile, image);
    imagePath = tempFile;
  } else {
    const tempFile = path.join(tmpdir(), `imagebind-${Date.now()}.png`);
    const buffer = Buffer.from(image, "base64");
    fs.writeFileSync(tempFile, buffer);
    imagePath = tempFile;
  }

  const result = await model(imagePath, { pooling: "mean", normalize: true });
  const data = result.data as Float32Array;
  return Array.from(data);
}

export async function embedAudio(audio: Buffer): Promise<number[]> {
  const model = await loadImageBindModel();

  const tempFile = path.join(tmpdir(), `imagebind-audio-${Date.now()}.wav`);
  fs.writeFileSync(tempFile, audio);

  const result = await model(tempFile, { pooling: "mean", normalize: true });
  const data = result.data as Float32Array;
  return Array.from(data);
}

export const dimensions = IMAGEBIND_DEFAULT_DIMENSIONS;

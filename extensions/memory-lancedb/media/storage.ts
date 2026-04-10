import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const DEFAULT_MEDIA_DIR = path.join(homedir(), ".openclaw", "memory", "media");

export interface MediaRef {
  id: string;
  type: "image" | "audio" | "file";
  mimeType: string;
  storedPath: string;
  originalName?: string;
  size: number;
  createdAt: number;
}

export class MediaStorage {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? DEFAULT_MEDIA_DIR;
  }

  async ensureInitialized(): Promise<void> {
    await fs.promises.mkdir(this.baseDir, { recursive: true });
  }

  async store(
    data: Buffer,
    type: "image" | "audio" | "file",
    mimeType: string,
    originalName?: string,
  ): Promise<MediaRef> {
    await this.ensureInitialized();

    const id = randomUUID();
    const ext = extensionForMime(mimeType) ?? ".bin";
    const storedPath = path.join(this.baseDir, `${id}${ext}`);

    await fs.promises.writeFile(storedPath, data);

    return {
      id,
      type,
      mimeType,
      storedPath,
      originalName,
      size: data.length,
      createdAt: Date.now(),
    };
  }

  async retrieve(mediaId: string): Promise<Buffer | null> {
    const filePath = path.join(this.baseDir, `${mediaId}*`);
    const files = await globSimple(filePath);
    if (files.length === 0) {
      return null;
    }
    return fs.promises.readFile(files[0]);
  }

  async delete(mediaId: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, `${mediaId}*`);
    const files = await globSimple(filePath);
    if (files.length === 0) {
      return false;
    }
    await fs.promises.unlink(files[0]);
    return true;
  }
}

function extensionForMime(mime: string): string | null {
  const map: Record<string, string> = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "audio/wav": ".wav",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
  };
  return map[mime] ?? null;
}

async function globSimple(pattern: string): Promise<string[]> {
  const dir = path.dirname(pattern);
  const prefix = path.basename(pattern).split("*")[0];
  try {
    const files = await fs.promises.readdir(dir);
    return files.filter((f) => f.startsWith(prefix)).map((f) => path.join(dir, f));
  } catch {
    return [];
  }
}

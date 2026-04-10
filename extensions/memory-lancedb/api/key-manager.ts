import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

let KEY_FILE = path.join(homedir(), ".openclaw", "memory", "api-key.txt");

export function setKeyFilePath(filePath: string): void {
  KEY_FILE = filePath;
}

export function getApiKeyPath(): string {
  return KEY_FILE;
}

export function ensureKeyGenerated(): string {
  const dir = path.dirname(KEY_FILE);
  fs.mkdirSync(dir, { recursive: true });

  try {
    const fd = fs.openSync(KEY_FILE, "wx");
    const newKey = randomBytes(16).toString("hex");
    fs.writeSync(fd, newKey);
    fs.closeSync(fd);
    try {
      if (process.platform !== "win32") {
        fs.chmodSync(KEY_FILE, 0o600);
      }
    } catch {
      // chmod may fail on some filesystems
    }
    return newKey;
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "EEXIST") {
      const key = fs.readFileSync(KEY_FILE, "utf-8").trim();
      if (key.length === 32) {
        return key;
      }
      const newKey = randomBytes(16).toString("hex");
      fs.writeFileSync(KEY_FILE, newKey, "utf-8");
      try {
        if (process.platform !== "win32") {
          fs.chmodSync(KEY_FILE, 0o600);
        }
      } catch {
        // chmod may fail on some filesystems
      }
      return newKey;
    }
    throw e;
  }
}

export function readApiKey(): string | null {
  if (!fs.existsSync(KEY_FILE)) {
    return null;
  }
  return fs.readFileSync(KEY_FILE, "utf-8").trim();
}

export function regenerateKey(): string {
  const dir = path.dirname(KEY_FILE);
  fs.mkdirSync(dir, { recursive: true });
  const newKey = randomBytes(16).toString("hex");
  fs.writeFileSync(KEY_FILE, newKey, "utf-8");
  fs.chmodSync(KEY_FILE, 0o600);
  return newKey;
}

export function validateApiKey(header: string | undefined, expectedKey: string): boolean {
  if (!header) {return false;}
  const provided = header.replace("Bearer ", "").trim();
  return provided === expectedKey;
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) {return "****";}
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

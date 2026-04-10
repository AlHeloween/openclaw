import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  ensureKeyGenerated,
  readApiKey,
  regenerateKey,
  validateApiKey,
  maskApiKey,
  getApiKeyPath,
  setKeyFilePath,
} from "./key-manager.js";

describe("key-manager", () => {
  let tmpDir: string;
  let keyFile: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "memory-key-test-"));
    keyFile = path.join(tmpDir, "api-key.txt");
    setKeyFilePath(keyFile);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("ensureKeyGenerated", () => {
    test("generates a new key if none exists", () => {
      const key = ensureKeyGenerated();
      expect(key).toHaveLength(32);
      expect(/^[0-9a-f]{32}$/.test(key)).toBe(true);
      expect(fs.existsSync(keyFile)).toBe(true);
    });

    test("returns existing key if already generated", () => {
      const first = ensureKeyGenerated();
      const second = ensureKeyGenerated();
      expect(first).toBe(second);
    });

    test("regenerates if existing key is invalid length", () => {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, "short");
      const key = ensureKeyGenerated();
      expect(key).toHaveLength(32);
      expect(key).not.toBe("short");
    });
  });

  describe("readApiKey", () => {
    test("returns null if no key file exists", () => {
      expect(readApiKey()).toBeNull();
    });

    test("returns the key if file exists", () => {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, "testkey1234567890123456789012");
      expect(readApiKey()).toBe("testkey1234567890123456789012");
    });

    test("trims whitespace from key file", () => {
      fs.mkdirSync(path.dirname(keyFile), { recursive: true });
      fs.writeFileSync(keyFile, "  testkey1234567890123456789012  \n");
      expect(readApiKey()).toBe("testkey1234567890123456789012");
    });
  });

  describe("regenerateKey", () => {
    test("generates a new key and writes it", () => {
      const first = ensureKeyGenerated();
      const second = regenerateKey();
      expect(second).toHaveLength(32);
      expect(second).not.toBe(first);
      expect(readApiKey()).toBe(second);
    });

    test("creates directory if missing", () => {
      const key = regenerateKey();
      expect(key).toHaveLength(32);
      expect(fs.existsSync(keyFile)).toBe(true);
    });
  });

  describe("validateApiKey", () => {
    test("returns false for undefined header", () => {
      expect(validateApiKey(undefined, "testkey1234567890123456789012")).toBe(false);
    });

    test("returns false for empty header", () => {
      expect(validateApiKey("", "testkey1234567890123456789012")).toBe(false);
    });

    test("validates correct Bearer token", () => {
      expect(
        validateApiKey("Bearer testkey1234567890123456789012", "testkey1234567890123456789012"),
      ).toBe(true);
    });

    test("rejects wrong key", () => {
      expect(
        validateApiKey("Bearer wrongkey123456789012345678901", "testkey1234567890123456789012"),
      ).toBe(false);
    });

    test("handles header without Bearer prefix", () => {
      expect(validateApiKey("testkey1234567890123456789012", "testkey1234567890123456789012")).toBe(
        true,
      );
    });
  });

  describe("maskApiKey", () => {
    test("masks long keys", () => {
      expect(maskApiKey("abcdefghijklmnopqrstuvwxyz123456")).toBe("abcd...3456");
    });

    test("returns **** for short keys", () => {
      expect(maskApiKey("short")).toBe("****");
      expect(maskApiKey("12345678")).toBe("****");
    });

    test("handles exactly 8 char keys", () => {
      expect(maskApiKey("12345678")).toBe("****");
    });
  });

  describe("getApiKeyPath", () => {
    test("returns the configured path", () => {
      expect(getApiKeyPath()).toBe(keyFile);
    });
  });
});

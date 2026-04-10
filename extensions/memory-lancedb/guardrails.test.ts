import { describe, test, expect } from "vitest";
import {
  validateMemoryEntry,
  validateCodeForMemory,
  validateClusterSize,
  checkVersionCompatibility,
  MULTIMODAL_MEMORY_VERSION,
  getGuardrailsSummary,
  DEFAULT_GUARDRAILS,
} from "./guardrails.js";

describe("guardrails", () => {
  describe("validateMemoryEntry", () => {
    test("accepts valid entry", () => {
      const errors = validateMemoryEntry({
        text: "Test memory",
        vector: Array.from({ length: 1024 }, () => 0.5),
        importance: 0.7,
        modality: "text",
      });
      expect(errors).toHaveLength(0);
    });

    test("rejects empty text", () => {
      const errors = validateMemoryEntry({ text: "" });
      expect(errors.some((e) => e.includes("cannot be empty"))).toBe(true);
    });

    test("rejects oversized text", () => {
      const errors = validateMemoryEntry({ text: "x".repeat(60000) });
      expect(errors.some((e) => e.includes("50"))).toBe(true);
    });

    test("rejects invalid vector dimensions", () => {
      const errors = validateMemoryEntry({
        text: "Test",
        vector: Array.from({ length: 512 }, () => 0.5),
      });
      expect(errors.some((e) => e.includes("range"))).toBe(true);
    });

    test("rejects invalid modality", () => {
      const errors = validateMemoryEntry({
        text: "Test",
        vector: Array.from({ length: 1024 }, () => 0.5),
        modality: "video" as any,
      });
      expect(errors.some((e) => e.includes("Unsupported"))).toBe(true);
    });

    test("rejects importance out of range", () => {
      const errors1 = validateMemoryEntry({ text: "Test", importance: -0.1 });
      expect(errors1.some((e) => e.includes("0") && e.includes("1"))).toBe(true);
    });
  });

  describe("validateCodeForMemory", () => {
    test("accepts allowed language with reasonable complexity", () => {
      const errors = validateCodeForMemory("typescript", 5);
      expect(errors).toHaveLength(0);
    });

    test("rejects unsupported language", () => {
      const errors = validateCodeForMemory("cobol", 1);
      expect(errors.length).toBeGreaterThan(0);
    });

    test("rejects excessive complexity", () => {
      const errors = validateCodeForMemory("python", 150);
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe("validateClusterSize", () => {
    test("accepts valid range", () => {
      expect(validateClusterSize(10)).toHaveLength(0);
      expect(validateClusterSize(100)).toHaveLength(0);
    });

    test("rejects too few items", () => {
      expect(validateClusterSize(1).length).toBeGreaterThan(0);
    });

    test("rejects too many items", () => {
      expect(validateClusterSize(500).length).toBeGreaterThan(0);
    });
  });

  describe("checkVersionCompatibility", () => {
    test("accepts matching version", () => {
      const result = checkVersionCompatibility(MULTIMODAL_MEMORY_VERSION);
      expect(result.compatible).toBe(true);
    });

    test("rejects mismatched version", () => {
      const result = checkVersionCompatibility("1.0.0");
      expect(result.compatible).toBe(false);
      expect(result.message).toContain("Version mismatch");
    });
  });

  describe("getGuardrailsSummary", () => {
    test("returns version and guardrails", () => {
      const summary = getGuardrailsSummary();
      expect(summary.version).toBe(MULTIMODAL_MEMORY_VERSION);
      expect(summary.guardrails).toHaveProperty("requireDualVectors");
      expect(summary.guardrails).toHaveProperty("supportedModalities");
    });
  });
});

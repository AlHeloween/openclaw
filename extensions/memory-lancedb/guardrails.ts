import { MEMORY_MODALITIES, type MemoryModality } from "./config.js";

export interface MemoryEntryMinimal {
  text: string;
  vector?: number[];
  multiVector?: number[];
  modality?: MemoryModality;
  importance?: number;
}

export const MULTIMODAL_MEMORY_VERSION = "2.0.0-multimodal";

export interface MultimodalGuardrails {
  requireMultimodalConfig: boolean;
  minEmbeddingDims: number;
  maxEmbeddingDims: number;
  supportedModalities: MemoryModality[];
  requireDualVectors: boolean;
  maxVectorDim: number;
  allowedLanguages: string[];
  maxCodeComplexity: number;
  maxMemoriesForClustering: number;
}

export const DEFAULT_GUARDRAILS: MultimodalGuardrails = {
  requireMultimodalConfig: true,
  minEmbeddingDims: 1024,
  maxEmbeddingDims: 2048,
  supportedModalities: ["text", "image", "audio", "multimodal"],
  requireDualVectors: true,
  maxVectorDim: 2048,
  allowedLanguages: [
    "typescript",
    "javascript",
    "python",
    "rust",
    "go",
    "java",
    "c",
    "cpp",
    "csharp",
    "ruby",
    "php",
    "swift",
    "kotlin",
    "scala",
    "bash",
    "sql",
    "html",
    "css",
    "json",
    "yaml",
    "toml",
    "markdown",
  ],
  maxCodeComplexity: 100,
  maxMemoriesForClustering: 200,
};

export function validateMemoryEntry(entry: MemoryEntryMinimal): string[] {
  const errors: string[] = [];

  if (!entry.text || entry.text.trim().length === 0) {
    errors.push("Memory text cannot be empty");
  }

  if (entry.text.length > 50000) {
    errors.push("Memory text exceeds 50,000 character limit");
  }

  if (
    entry.vector &&
    (entry.vector.length < DEFAULT_GUARDRAILS.minEmbeddingDims ||
      entry.vector.length > DEFAULT_GUARDRAILS.maxEmbeddingDims)
  ) {
    errors.push(
      `Vector dimensions ${entry.vector.length} outside allowed range [${DEFAULT_GUARDRAILS.minEmbeddingDims}, ${DEFAULT_GUARDRAILS.maxEmbeddingDims}]`,
    );
  }

  if (
    entry.multiVector &&
    (entry.multiVector.length < DEFAULT_GUARDRAILS.minEmbeddingDims ||
      entry.multiVector.length > DEFAULT_GUARDRAILS.maxEmbeddingDims)
  ) {
    errors.push(`Multi-vector dimensions ${entry.multiVector.length} outside allowed range`);
  }

  if (DEFAULT_GUARDRAILS.requireDualVectors && !entry.vector) {
    errors.push("Dual-vector mode requires text embedding vector");
  }

  if (entry.modality && !DEFAULT_GUARDRAILS.supportedModalities.includes(entry.modality)) {
    errors.push(
      `Unsupported modality: ${entry.modality}. Allowed: ${DEFAULT_GUARDRAILS.supportedModalities.join(", ")}`,
    );
  }

  if (entry.importance !== undefined && (entry.importance < 0 || entry.importance > 1)) {
    errors.push("Importance must be between 0 and 1");
  }

  return errors;
}

export function validateCodeForMemory(language: string, complexity: number): string[] {
  const errors: string[] = [];

  if (!DEFAULT_GUARDRAILS.allowedLanguages.includes(language)) {
    errors.push(`Language '${language}' not in allowed list`);
  }

  if (complexity > DEFAULT_GUARDRAILS.maxCodeComplexity) {
    errors.push(
      `Code complexity ${complexity} exceeds maximum ${DEFAULT_GUARDRAILS.maxCodeComplexity}`,
    );
  }

  return errors;
}

export function validateClusterSize(n: number): string[] {
  const errors: string[] = [];

  if (n < 2) {
    errors.push("Need at least 2 items to cluster");
  }

  if (n > DEFAULT_GUARDRAILS.maxMemoriesForClustering) {
    errors.push(
      `Too many items (${n}) for clustering. Max: ${DEFAULT_GUARDRAILS.maxMemoriesForClustering}`,
    );
  }

  return errors;
}

export function checkVersionCompatibility(currentVersion: string): {
  compatible: boolean;
  message: string;
} {
  const required = MULTIMODAL_MEMORY_VERSION;

  if (currentVersion !== required) {
    return {
      compatible: false,
      message: `Version mismatch: expected ${required}, got ${currentVersion}. The multimodal memory system requires explicit version alignment.`,
    };
  }

  return { compatible: true, message: "Version compatible" };
}

export function getGuardrailsSummary(): Record<string, unknown> {
  return {
    version: MULTIMODAL_MEMORY_VERSION,
    guardrails: DEFAULT_GUARDRAILS,
  };
}

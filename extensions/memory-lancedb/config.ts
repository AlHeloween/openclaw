import fs from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type MemoryEmbeddingProvider = "harrier" | "openai" | "composite";

export type MemoryConfig = {
  embedding: {
    provider: MemoryEmbeddingProvider;
    model: string;
    apiKey?: string;
    baseUrl?: string;
    dimensions?: number;
  };
  embeddingMultimodal?: Record<string, unknown>;
  dbPath?: string;
  namespace?: string;
  autoCapture?: boolean;
  autoRecall?: boolean;
  captureMaxChars?: number;
  search?: Record<string, unknown>;
  autoCaptureMultimodal?: Record<string, unknown>;
};

export const MEMORY_CATEGORIES = ["preference", "fact", "decision", "entity", "other"] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];

export const MEMORY_MODALITIES = ["text", "image", "audio", "spatial", "multimodal"] as const;
export type MemoryModality = (typeof MEMORY_MODALITIES)[number];

const DEFAULT_MODEL = "text-embedding-3-small";
const DEFAULT_PROVIDER: MemoryEmbeddingProvider = "harrier";
export const DEFAULT_CAPTURE_MAX_CHARS = 500;
export const DEFAULT_FUSION_WEIGHTS = { text: 0.6, multi: 0.4 };
const LEGACY_STATE_DIRS: string[] = [];

function resolveDefaultDbPath(): string {
  const home = homedir();
  const preferred = join(home, ".openclaw", "memory", "lancedb");
  try {
    if (fs.existsSync(preferred)) {
      return preferred;
    }
  } catch {
    // best-effort
  }

  for (const legacy of LEGACY_STATE_DIRS) {
    const candidate = join(home, legacy, "memory", "lancedb");
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // best-effort
    }
  }

  return preferred;
}

const DEFAULT_DB_PATH = resolveDefaultDbPath();
const DEFAULT_NAMESPACE = "global";

const EMBEDDING_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "harrier-oss-v1-0.6b": 1024,
  imagebind: 1024,
};

function assertAllowedKeys(value: Record<string, unknown>, allowed: string[], label: string) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) {
    return;
  }
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

export function vectorDimsForModel(model: string): number {
  const dims = EMBEDDING_DIMENSIONS[model];
  if (!dims) {
    throw new Error(`Unsupported embedding model: ${model}`);
  }
  return dims;
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (envValue === undefined) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

function resolveEmbeddingModel(embedding: Record<string, unknown>): string {
  const model = typeof embedding.model === "string" ? embedding.model : DEFAULT_MODEL;
  if (typeof embedding.dimensions !== "number") {
    vectorDimsForModel(model);
  }
  return model;
}

function resolveEmbeddingProvider(embedding: Record<string, unknown>): MemoryEmbeddingProvider {
  const provider = embedding.provider as MemoryEmbeddingProvider | undefined;
  if (provider && ["harrier", "openai", "composite"].includes(provider)) {
    return provider;
  }
  if (typeof embedding.apiKey !== "string") {
    return "harrier";
  }
  return "openai";
}

function parseOptionalObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

export const memoryConfigSchema = {
  parse(value: unknown): MemoryConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory config required");
    }
    const cfg = value as Record<string, unknown>;
    assertAllowedKeys(
      cfg,
      ["embedding", "dbPath", "namespace", "autoCapture", "autoRecall", "captureMaxChars"],
      "memory config",
    );

    const embedding = cfg.embedding as Record<string, unknown> | undefined;
    const embeddingConfig: Record<string, unknown> = embedding || {};

    assertAllowedKeys(
      embeddingConfig,
      ["provider", "apiKey", "model", "baseUrl", "dimensions"],
      "embedding config",
    );

    const provider = resolveEmbeddingProvider(embeddingConfig);
    const model = resolveEmbeddingModel(embeddingConfig);

    let apiKey: string | undefined;
    if (typeof embeddingConfig.apiKey === "string") {
      apiKey = resolveEnvVars(embeddingConfig.apiKey);
    } else if (provider === "openai") {
      throw new Error("embedding.apiKey is required when provider is 'openai'");
    }

    const captureMaxChars =
      typeof cfg.captureMaxChars === "number" ? Math.floor(cfg.captureMaxChars) : undefined;
    if (
      typeof captureMaxChars === "number" &&
      (captureMaxChars < 100 || captureMaxChars > 10_000)
    ) {
      throw new Error("captureMaxChars must be between 100 and 10000");
    }

    return {
      embedding: {
        provider,
        model,
        apiKey,
        baseUrl:
          typeof embeddingConfig.baseUrl === "string"
            ? resolveEnvVars(embeddingConfig.baseUrl)
            : undefined,
        dimensions:
          typeof embeddingConfig.dimensions === "number" ? embeddingConfig.dimensions : undefined,
      },
      dbPath: typeof cfg.dbPath === "string" ? cfg.dbPath : DEFAULT_DB_PATH,
      namespace: typeof cfg.namespace === "string" ? cfg.namespace : DEFAULT_NAMESPACE,
      autoCapture: cfg.autoCapture === true,
      autoRecall: cfg.autoRecall !== false,
      captureMaxChars: captureMaxChars ?? DEFAULT_CAPTURE_MAX_CHARS,
      embeddingMultimodal: parseOptionalObject(cfg.embeddingMultimodal),
      search: parseOptionalObject(cfg.search),
      autoCaptureMultimodal: parseOptionalObject(cfg.autoCaptureMultimodal),
    };
  },
  uiHints: {
    "embedding.provider": {
      label: "Embedding Provider",
      help: "Harrier (local, no API key needed), OpenAI, or Composite (Harrier → OpenAI fallback)",
    },
    "embedding.apiKey": {
      label: "API Key",
      sensitive: true,
      placeholder: "sk-proj-...",
      help: "API key for OpenAI embeddings (optional if using Harrier)",
    },
    "embedding.baseUrl": {
      label: "Base URL",
      placeholder: "https://api.openai.com/v1",
      help: "Base URL for compatible providers (e.g. http://localhost:11434/v1)",
      advanced: true,
    },
    "embedding.dimensions": {
      label: "Dimensions",
      placeholder: "1536",
      help: "Vector dimensions for custom models (required for non-standard models)",
      advanced: true,
    },
    "embedding.model": {
      label: "Embedding Model",
      placeholder: DEFAULT_MODEL,
      help: "Embedding model to use (e.g. text-embedding-3-small, harrier-oss-v1-0.6b)",
    },
    namespace: {
      label: "Namespace",
      placeholder: DEFAULT_NAMESPACE,
      help: "Project/workspace namespace for memory isolation (e.g. project name or path)",
    },
    dbPath: {
      label: "Database Path",
      placeholder: "~/.openclaw/memory/lancedb",
      advanced: true,
    },
    autoCapture: {
      label: "Auto-Capture",
      help: "Automatically capture important information from conversations",
    },
    autoRecall: {
      label: "Auto-Recall",
      help: "Automatically inject relevant memories into context",
    },
    captureMaxChars: {
      label: "Capture Max Chars",
      help: "Maximum message length eligible for auto-capture",
      advanced: true,
      placeholder: String(DEFAULT_CAPTURE_MAX_CHARS),
    },
  },
};

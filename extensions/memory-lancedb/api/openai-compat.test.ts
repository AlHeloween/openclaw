import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, test, expect, vi } from "vitest";
import { createOpenAICompatHandler, type OpenAICompatHandlerDeps } from "./openai-compat.js";

vi.mock("./usage-tracker.js", () => ({
  recordUsage: vi.fn(),
}));

function makeRequest(
  pathname: string,
  method = "GET",
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
) {
  const url = new URL(pathname, "http://localhost");
  const req = {
    url: pathname,
    method,
    headers: headers || {},
    on: vi.fn((event: string, cb: (chunk: unknown) => void) => {
      if (event === "data" && body) {
        cb(JSON.stringify(body));
      }
      if (event === "end") {
        setTimeout(() => cb(undefined), 0);
      }
    }),
  } as unknown as IncomingMessage;

  const res = {
    writeHead: vi.fn(),
    setHeader: vi.fn(),
    end: vi.fn(),
  } as unknown as ServerResponse;

  return { req, res, url };
}

function makeDeps(overrides?: Partial<OpenAICompatHandlerDeps>): OpenAICompatHandlerDeps {
  return {
    embeddingProvider: {
      embed: vi.fn(async () => [0.1, 0.2, 0.3]),
      dimensions: 1024,
      provider: "harrier",
    },
    db: {
      search: vi.fn(async () => []),
    },
    namespace: "global",
    apiKey: "test-api-key-1234567890123456789012",
    ...overrides,
  };
}

describe("openai-compat API", () => {
  describe("createOpenAICompatHandler", () => {
    test("returns false for non-matching path", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest("/other/path");
      const result = await handler(req, res, url);
      expect(result).toBe(false);
    });

    test("rejects requests with invalid API key", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest("/api/v1/models", "GET", undefined, {
        authorization: "Bearer wrong-key",
      });
      const result = await handler(req, res, url);
      expect(result).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(401);
    });

    test("accepts requests with correct API key", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest("/api/v1/models", "GET", undefined, {
        authorization: "Bearer test-api-key-1234567890123456789012",
      });
      const result = await handler(req, res, url);
      expect(result).toBe(true);
      expect(res.writeHead).not.toHaveBeenCalledWith(401);
    });

    test("accepts requests when no API key is configured", async () => {
      const handler = createOpenAICompatHandler({ ...makeDeps(), apiKey: undefined });
      const { req, res, url } = makeRequest("/api/v1/models", "GET");
      const result = await handler(req, res, url);
      expect(result).toBe(true);
    });

    test("handles OPTIONS requests", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest("/api/v1/models", "OPTIONS", undefined, {
        authorization: "Bearer test-api-key-1234567890123456789012",
      });
      const result = await handler(req, res, url);
      expect(result).toBe(true);
      expect(res.writeHead).toHaveBeenCalledWith(204);
    });
  });

  describe("GET /api/v1/models", () => {
    test("returns list of available models", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest("/api/v1/models", "GET", undefined, {
        authorization: "Bearer test-api-key-1234567890123456789012",
      });
      await handler(req, res, url);
      expect(res.writeHead).not.toHaveBeenCalledWith(401);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.object).toBe("list");
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.some((m: any) => m.id === "harrier-oss-v1-0.6b")).toBe(true);
    });
  });

  describe("POST /api/v1/embeddings", () => {
    test("returns embeddings for string input", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/embeddings",
        "POST",
        {
          input: "hello world",
          model: "harrier-oss-v1-0.6b",
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.object).toBe("list");
      expect(response.data).toHaveLength(1);
      expect(response.data[0].object).toBe("embedding");
      expect(response.data[0].index).toBe(0);
      expect(Array.isArray(response.data[0].embedding)).toBe(true);
    });

    test("returns embeddings for array input", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/embeddings",
        "POST",
        {
          input: ["hello", "world"],
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.data).toHaveLength(2);
      expect(response.data[0].index).toBe(0);
      expect(response.data[1].index).toBe(1);
    });

    test("returns 400 when input is missing", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/embeddings",
        "POST",
        {},
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });
  });

  describe("POST /api/v1/chat/completions", () => {
    test("returns memory-augmented response", async () => {
      const deps = makeDeps();
      (deps.db.search as any).mockResolvedValue([
        {
          entry: {
            id: "1",
            text: "User prefers dark mode",
            namespace: "global",
            category: "preference",
            modality: "text",
            importance: 0.7,
          },
          score: 0.9,
        },
      ]);
      const handler = createOpenAICompatHandler(deps);
      const { req, res, url } = makeRequest(
        "/api/v1/chat/completions",
        "POST",
        {
          messages: [{ role: "user", content: "What do I prefer?" }],
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.id).toBeDefined();
      expect(response.object).toBe("chat.completion");
      expect(response.model).toBe("memory-augmented");
      expect(response.choices).toHaveLength(1);
      expect(response.choices[0].message.role).toBe("assistant");
    });

    test("returns 400 when messages is empty", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/chat/completions",
        "POST",
        {
          messages: [],
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });

    test("returns 400 when no user message", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/chat/completions",
        "POST",
        {
          messages: [{ role: "assistant", content: "Hello" }],
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });
  });

  describe("POST /api/v1/search", () => {
    test("searches memories and returns results", async () => {
      const deps = makeDeps();
      (deps.db.search as any).mockResolvedValue([
        {
          entry: {
            id: "1",
            text: "Memory text",
            namespace: "global",
            category: "fact",
            modality: "text",
            importance: 0.7,
          },
          score: 0.85,
        },
      ]);
      const handler = createOpenAICompatHandler(deps);
      const { req, res, url } = makeRequest(
        "/api/v1/search",
        "POST",
        {
          query: "memory text",
          limit: 5,
        },
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.object).toBe("list");
      expect(response.data).toHaveLength(1);
      expect(response.data[0].text).toBe("Memory text");
      expect(response.data[0].score).toBe(0.85);
    });

    test("returns 400 when query is missing", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/search",
        "POST",
        {},
        {
          authorization: "Bearer test-api-key-1234567890123456789012",
        },
      );
      await handler(req, res, url);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });

    test("filters search results by namespace", async () => {
      const deps = makeDeps();
      (deps.db.search as any).mockResolvedValue([
        {
          entry: {
            id: "1",
            text: "Global memory",
            namespace: "global",
            category: "fact",
            modality: "text",
            importance: 0.7,
          },
          score: 0.9,
        },
        {
          entry: {
            id: "2",
            text: "Project memory",
            namespace: "project-x",
            category: "fact",
            modality: "text",
            importance: 0.8,
          },
          score: 0.85,
        },
      ]);
      const handler = createOpenAICompatHandler(deps);
      const { req, res, url } = makeRequest(
        "/api/v1/search",
        "POST",
        { query: "test", namespace: "project-x" },
        { authorization: "Bearer test-api-key-1234567890123456789012" },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.data).toHaveLength(1);
      expect(response.data[0].text).toBe("Project memory");
    });

    test("returns all namespaces when namespace is 'all'", async () => {
      const deps = makeDeps();
      (deps.db.search as any).mockResolvedValue([
        {
          entry: {
            id: "1",
            text: "Global memory",
            namespace: "global",
            category: "fact",
            modality: "text",
            importance: 0.7,
          },
          score: 0.9,
        },
        {
          entry: {
            id: "2",
            text: "Project memory",
            namespace: "project-x",
            category: "fact",
            modality: "text",
            importance: 0.8,
          },
          score: 0.85,
        },
      ]);
      const handler = createOpenAICompatHandler(deps);
      const { req, res, url } = makeRequest(
        "/api/v1/search",
        "POST",
        { query: "test", namespace: "all" },
        { authorization: "Bearer test-api-key-1234567890123456789012" },
      );
      await handler(req, res, url);
      const response = JSON.parse((res.end as any).mock.calls[0][0]);
      expect(response.data).toHaveLength(2);
    });
  });

  describe("POST /api/v1/embeddings input limits", () => {
    test("returns 400 when more than 100 inputs", async () => {
      const handler = createOpenAICompatHandler(makeDeps());
      const { req, res, url } = makeRequest(
        "/api/v1/embeddings",
        "POST",
        { input: Array(101).fill("test") },
        { authorization: "Bearer test-api-key-1234567890123456789012" },
      );
      await handler(req, res, url);
      expect(res.writeHead).toHaveBeenCalledWith(400);
    });
  });
});

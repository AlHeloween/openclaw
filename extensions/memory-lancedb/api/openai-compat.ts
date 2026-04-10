import type { IncomingMessage, ServerResponse } from "node:http";
import { recordUsage } from "./usage-tracker.js";

export interface OpenAICompatRequest {
  model?: string;
  input?: string | string[];
  messages?: Array<{ role: string; content: string }>;
  namespace?: string;
  dimensions?: number;
}

export interface OpenAICompatResponse {
  object: string;
  data?: unknown[];
  model?: string;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  id?: string;
  choices?: unknown[];
}

export interface OpenAICompatHandlerDeps {
  embeddingProvider: {
    embed: (text: string) => Promise<number[]>;
    dimensions: number;
    provider: string;
  };
  db: {
    search: (
      vector: number[],
      limit?: number,
      minScore?: number,
    ) => Promise<
      Array<{
        entry: {
          id: string;
          text: string;
          namespace: string;
          category: string;
          modality: string;
          importance: number;
          score?: number;
        };
        score: number;
      }>
    >;
  };
  namespace: string;
  apiKey?: string;
}

function validateAuth(req: IncomingMessage, expectedKey?: string): boolean {
  if (!expectedKey) {return true;}
  const authHeader = req.headers.authorization || "";
  const provided = authHeader.replace("Bearer ", "").trim();
  return provided === expectedKey;
}

export function createOpenAICompatHandler(deps: OpenAICompatHandlerDeps) {
  return async (req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> => {
    if (!url.pathname.startsWith("/api/v1/")) {
      return false;
    }

    if (!validateAuth(req, deps.apiKey)) {
      res.writeHead(401);
      res.end(JSON.stringify({ error: "Invalid or missing API key" }));
      return true;
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return true;
    }

    if (url.pathname === "/api/v1/models" && req.method === "GET") {
      const models = [
        { id: "harrier-oss-v1-0.6b", object: "model", owned_by: "local" },
        { id: "imagebind", object: "model", owned_by: "local" },
        { id: "memory-augmented", object: "model", owned_by: "openclaw" },
      ];
      res.end(JSON.stringify({ object: "list", data: models }));
      return true;
    }

    if (url.pathname === "/api/v1/embeddings" && req.method === "POST") {
      return handleWithTracking("/api/v1/embeddings", req.method, deps.namespace, () =>
        handleEmbeddings(req, res, deps),
      );
    }

    if (url.pathname === "/api/v1/chat/completions" && req.method === "POST") {
      return handleWithTracking("/api/v1/chat/completions", req.method, deps.namespace, () =>
        handleChatCompletions(req, res, deps),
      );
    }

    if (url.pathname === "/api/v1/search" && req.method === "POST") {
      return handleWithTracking("/api/v1/search", req.method, deps.namespace, () =>
        handleSearch(req, res, deps),
      );
    }

    return false;
  };
}

const MAX_BODY_SIZE = 1024 * 1024; // 1MB

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    req.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      body += chunk;
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", (err) => {
      reject(err);
    });
  });
}

async function handleWithTracking(
  endpoint: string,
  method: string,
  namespace: string,
  fn: () => Promise<boolean>,
): Promise<boolean> {
  const start = Date.now();
  try {
    const result = await fn();
    recordUsage({
      endpoint,
      method,
      namespace,
      durationMs: Date.now() - start,
      success: true,
    });
    return result;
  } catch (e) {
    recordUsage({
      endpoint,
      method,
      namespace,
      durationMs: Date.now() - start,
      success: false,
      error: String(e),
    });
    return false;
  }
}

async function handleEmbeddings(
  req: IncomingMessage,
  res: ServerResponse,
  deps: OpenAICompatHandlerDeps,
): Promise<boolean> {
  const body = await readBody(req);
  const input = body.input as string | string[] | undefined;
  const model = (body.model as string) || "harrier-oss-v1-0.6b";
  const namespace = (body.namespace as string) || deps.namespace;

  if (!input) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "input is required" }));
    return true;
  }

  const inputs = Array.isArray(input) ? input : [input];
  if (inputs.length > 100) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Maximum 100 inputs allowed" }));
    return true;
  }

  const data = [];

  for (let i = 0; i < inputs.length; i++) {
    try {
      const embedding = await deps.embeddingProvider.embed(inputs[i]);
      data.push({
        object: "embedding",
        embedding,
        index: i,
      });
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e) }));
      return true;
    }
  }

  const response: OpenAICompatResponse = {
    object: "list",
    data,
    model,
    usage: {
      prompt_tokens: inputs.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
      total_tokens: inputs.reduce((s, t) => s + Math.ceil(t.length / 4), 0),
      completion_tokens: 0,
    },
  };

  res.end(JSON.stringify(response));
  return true;
}

async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  deps: OpenAICompatHandlerDeps,
): Promise<boolean> {
  const body = await readBody(req);
  const messages = (body.messages as Array<{ role: string; content: string }>) || [];
  const namespace = (body.namespace as string) || deps.namespace;

  if (messages.length === 0) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "messages array is required" }));
    return true;
  }

  const lastUserMessage = [...messages].toReversed().find((m) => m.role === "user");
  if (!lastUserMessage) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "at least one user message is required" }));
    return true;
  }

  try {
    const queryVector = await deps.embeddingProvider.embed(lastUserMessage.content);
    const results = await deps.db.search(queryVector, 5, 0.3);

    const memoryContext =
      results.length > 0
        ? results
            .filter((r) => r.entry.namespace === namespace || namespace === "global")
            .slice(0, 3)
            .map((r, i) => `${i + 1}. [${r.entry.category}] ${r.entry.text}`)
            .join("\n")
        : "No relevant memories found.";

    const content = `Based on stored memories:\n\n${memoryContext}`;

    const response: OpenAICompatResponse = {
      id: `mem-${Date.now()}`,
      object: "chat.completion",
      model: "memory-augmented",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: Math.ceil(lastUserMessage.content.length / 4),
        completion_tokens: Math.ceil(content.length / 4),
        total_tokens: Math.ceil((lastUserMessage.content.length + content.length) / 4),
      },
    };

    res.end(JSON.stringify(response));
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: String(e) }));
  }

  return true;
}

async function handleSearch(
  req: IncomingMessage,
  res: ServerResponse,
  deps: OpenAICompatHandlerDeps,
): Promise<boolean> {
  const body = await readBody(req);
  const query = body.query as string | undefined;
  const namespace = (body.namespace as string) || deps.namespace;
  const limit = (body.limit as number) || 10;

  if (!query) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "query is required" }));
    return true;
  }

  try {
    const vector = await deps.embeddingProvider.embed(query);
    const results = await deps.db.search(vector, limit, 0.1);

    const filtered = results
      .filter((r) => r.entry.namespace === namespace || namespace === "all")
      .map((r) => ({
        id: r.entry.id,
        text: r.entry.text,
        category: r.entry.category,
        modality: r.entry.modality,
        namespace: r.entry.namespace,
        importance: r.entry.importance,
        score: r.score,
      }));

    res.end(
      JSON.stringify({
        object: "list",
        data: filtered,
        total: filtered.length,
      }),
    );
  } catch (e) {
    res.writeHead(500);
    res.end(JSON.stringify({ error: String(e) }));
  }

  return true;
}

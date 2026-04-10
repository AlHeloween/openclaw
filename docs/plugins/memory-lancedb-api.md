---
title: "Memory (LanceDB) Plugin API"
summary: "OpenAI-compatible API reference for the LanceDB memory plugin"
read_when:
  - You want to integrate external tools with the memory plugin
  - You need to use the memory API from VSCode, LangChain, or other clients
---

# Memory (LanceDB) Plugin API

The LanceDB memory plugin exposes an **OpenAI-compatible REST API** for
embedding generation, memory search, and memory-augmented chat completions.

## Base URL

```
http://localhost:8080/plugins/memory-lancedb/api/v1/
```

Replace `8080` with your gateway port.

## Authentication

All endpoints require an API key passed in the `Authorization` header:

```
Authorization: Bearer <api-key>
```

The API key is auto-generated on first use and stored at
`~/.openclaw/memory/api-key.txt`. Use the `openclaw ltm api-key` command
to view or regenerate it.

## Endpoints

### GET /v1/models

Returns the list of available embedding models.

```json
{
  "object": "list",
  "data": [
    { "id": "harrier-oss-v1-0.6b", "object": "model", "owned_by": "local" },
    { "id": "imagebind", "object": "model", "owned_by": "local" },
    { "id": "memory-augmented", "object": "model", "owned_by": "openclaw" }
  ]
}
```

### POST /v1/embeddings

Generates embeddings for the given input text(s).

**Request:**

```json
{
  "input": "hello world",
  "model": "harrier-oss-v1-0.6b",
  "namespace": "global"
}
```

Or for multiple inputs:

```json
{
  "input": ["hello", "world"],
  "model": "harrier-oss-v1-0.6b"
}
```

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "object": "embedding",
      "embedding": [0.1, 0.2, ...],
      "index": 0
    }
  ],
  "model": "harrier-oss-v1-0.6b",
  "usage": {
    "prompt_tokens": 2,
    "total_tokens": 2,
    "completion_tokens": 0
  }
}
```

### POST /v1/chat/completions

Returns a memory-augmented response. Queries the memory store for relevant
memories and includes them in the response context.

**Request:**

```json
{
  "messages": [{ "role": "user", "content": "What do I prefer?" }],
  "namespace": "global"
}
```

**Response:**

```json
{
  "id": "mem-1234567890",
  "object": "chat.completion",
  "model": "memory-augmented",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Based on stored memories:\n\n1. [preference] User prefers dark mode"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 25,
    "total_tokens": 35
  }
}
```

### POST /v1/search

Searches the memory store for entries matching the query.

**Request:**

```json
{
  "query": "dark mode",
  "namespace": "global",
  "limit": 10
}
```

**Response:**

```json
{
  "object": "list",
  "data": [
    {
      "id": "uuid-here",
      "text": "User prefers dark mode",
      "category": "preference",
      "modality": "text",
      "namespace": "global",
      "importance": 0.7,
      "score": 0.92
    }
  ],
  "total": 1
}
```

## Admin Endpoints

Admin endpoints are served at `/plugins/memory-lancedb/admin/` and require
gateway authentication.

### GET /admin/api-key

Returns the current API key (masked).

```json
{
  "key": "abcd...3456",
  "generated": true
}
```

### POST /admin/api-key

Regenerates the API key. **Warning:** existing integrations will break.

```json
{
  "key": "full-new-key-here",
  "masked": "abcd...3456"
}
```

### GET /admin/usage

Returns usage statistics. Optional query parameters: `start` and `end`
(Unix timestamps in milliseconds) to filter by time range.

```json
{
  "summary": {
    "totalRequests": 42,
    "successCount": 40,
    "errorCount": 2,
    "avgDurationMs": 87,
    "byEndpoint": {
      "/api/v1/embeddings": { "count": 30, "avgDurationMs": 65 },
      "/api/v1/search": { "count": 12, "avgDurationMs": 140 }
    }
  },
  "records": [
    {
      "timestamp": 1775474901244,
      "endpoint": "/api/v1/embeddings",
      "method": "POST",
      "namespace": "global",
      "durationMs": 42,
      "success": true
    }
  ]
}
```

### DELETE /admin/usage

Clears usage records. Optional query parameters: `start` and `end`
(Unix timestamps in milliseconds) to clear a specific time range.
Without parameters, clears all records.

```json
{
  "removed": 42
}
```

## CLI Commands

```bash
# Show or generate API key
openclaw ltm api-key --show
openclaw ltm api-key --generate

# List namespaces
openclaw ltm namespaces --list

# Delete a namespace and all its memories
openclaw ltm namespaces --delete my-project

# Show usage statistics
openclaw ltm usage --show
openclaw ltm usage --show --from 1700000000000 --to 1700100000000

# Clear usage records
openclaw ltm usage --clear
openclaw ltm usage --clear --from 1700000000000 --to 1700100000000
```

## Namespace Isolation

Each memory entry belongs to a **namespace** (default: `"global"`). Use
namespaces to isolate memories between projects:

- Set `namespace` in your config to use a project-specific namespace.
- Pass `namespace` in API requests to scope queries to a specific namespace.
- Use `openclaw ltm namespaces --list` to see all namespaces.
- Use `openclaw ltm namespaces --delete <name>` to remove a namespace.

## Example: VSCode Integration

Add to your VSCode settings:

```json
{
  "memory.apiEndpoint": "http://localhost:8080/plugins/memory-lancedb/api/v1/",
  "memory.apiKey": "<your-api-key>"
}
```

## Example: LangChain Integration

```python
from langchain_openai import OpenAIEmbeddings

embeddings = OpenAIEmbeddings(
    model="harrier-oss-v1-0.6b",
    openai_api_base="http://localhost:8080/plugins/memory-lancedb/api/v1",
    openai_api_key="<your-api-key>",
)

vectors = embeddings.embed_documents(["hello world", "goodbye world"])
```

## Related

- [Memory Plugin](/plugins/memory-lancedb) — plugin overview and configuration
- [Builtin Memory](/concepts/memory-builtin) — default SQLite-based memory
- [API Key Management](/cli/memory#api-key) — CLI reference

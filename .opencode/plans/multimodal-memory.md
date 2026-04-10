# Multimodal Memory System — Implementation Plan

## Vision

Extend OpenClaw's `memory-lancedb` plugin from text-only vector memory to a **dual-embedding multimodal system** that stores and recalls text, images, audio, and spatial context through unified vector search.

### Core Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Memory Entry                                      │
│                                                                      │
│  text: "User prefers dark mode in VS Code"                           │
│  image: [optional: screenshot of VS Code settings]                   │
│  audio: [optional: voice note about preferences]                     │
│  spatial: [optional: device orientation, location]                   │
│                                                                      │
│  text_vector:    1024-dim (Harrier-OSS-v1-0.6b)  ← text-optimized   │
│  multi_vector:   1024-dim (ImageBind)            ← multimodal       │
│                                                                      │
│  modality:       text / image / audio / spatial / multimodal         │
│  importance:     0.7                                                 │
│  category:       preference / fact / decision / entity / other       │
│  createdAt:      1712345678000                                       │
└─────────────────────────────────────────────────────────────────────┘
```

### Why This Design

| Component               | Role                            | Advantage                                                                   |
| ----------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| **Harrier-OSS-v1-0.6b** | Text embedding (1024-dim)       | SOTA on multilingual MTEB v2, 0.6B params, fast inference, Microsoft-backed |
| **ImageBind**           | Multimodal embedding (1024-dim) | Unified space for text+image+audio+3D, cross-modal search, Meta research    |
| **Same dimensions**     | Both output 1024-dim            | No projection needed, simpler fusion, LanceDB-friendly                      |
| **Dual vectors**        | Separate columns                | Maintain modality-specific tuning, flexible weighting                       |

### Search Strategy

```
Text Query → Embed with Harrier → Search text_vector → Text-optimized results
           → Embed with ImageBind → Search multi_vector → Multimodal results
           → Fuse scores → Ranked combined results
```

### Future Extension: DeepSeek-VL

```
Document (PDF/chart) → DeepSeek-VL → doc_vector (1024-dim)
                     → Specialized chart/PDF understanding
                     → Complements Harrier (text) + ImageBind (multimodal)
```

---

## Phase 1: Foundation — Dual Embedding Infrastructure

### 1.1 Runtime Loaders

**Status: DONE** — Direct `@huggingface/transformers` usage in embedding impl files (no separate runtime files needed).

### 1.2 Embedding Classes

**Status: DONE**

- `extensions/memory-lancedb/embeddings/harrier.ts` — HarrierEmbeddings class
- `extensions/memory-lancedb/embeddings/harrier-impl.ts` — Harrier model loading
- `extensions/memory-lancedb/embeddings/imagebind.ts` — ImageBindEmbeddings class
- `extensions/memory-lancedb/embeddings/imagebind-impl.ts` — ImageBind model loading

### 1.3 Updated LanceDB Schema

**Status: DONE** — `MemoryDB` class updated with `multiVector` column, `searchMulti()` method.

### 1.4 Configuration Updates

**Status: DONE** — `config.ts` updated with `embeddingMultimodal`, `search`, `MEMORY_MODALITIES`.

---

## Phase 2: Storage — Dual Embedding Generation

### 2.1 Update `memory_store` Tool

**Status: DONE** — Generates both Harrier and ImageBind embeddings, stores dual vectors, supports `modality`, `imageData`, `audioData` params.

### 2.2 Media Storage Strategy

**Status: DONE** — `extensions/memory-lancedb/media/storage.ts` for external file storage.

### 2.3 Update Auto-Capture

**Status: DONE** — Handles multimodal content blocks (image/audio) from conversation messages.

---

## Phase 3: Search & Recall — Dual Vector Fusion

### 3.1 Dual-Vector Search Algorithm

**Status: DONE** — `searchMulti()` in MemoryDB, dual-vector search in `memory_recall` tool.

### 3.2 Score Fusion Strategy

**Status: DONE** — `extensions/memory-lancedb/search/fusion.ts` with configurable weights (default 0.6:0.4).

### 3.3 Updated `memory_recall` Tool

**Status: DONE** — Dual-vector search with fusion, returns `textScore` and `multiScore`.

### 3.4 Auto-Recall Enhancement

**Status: DONE** — `before_agent_start` hook uses dual-vector fusion when multimodal enabled.

---

## Phase 3.5: Document Understanding

### Artifacts

**Status: DONE**

- `extensions/memory-lancedb/artifacts/` — Test documents directory (git-ignored)
- `PVA+Silicone-Strain-Sensor.pdf` — Scientific publication (5.7MB, MDPI Gels 2024)
- `MedSynth.djvu` — Medical synthesis DJVU document (14MB)

### Document Parser

**Status: DONE** — `extensions/memory-lancedb/documents/parser.ts`

- `parsePDF()` — Uses `pdf-parse` v2 for text extraction
- `parseDocument()` — Format-agnostic entry point (PDF/DJVU)
- `extractDocumentText()` — Concatenates page text
- `splitIntoChunks()` — Overlapping chunk generation for memory storage

**DJVU note:** djvujs is not on npm. To add DJVU support, clone from https://github.com/RussCoder/djvujs and vendor the library.

---

## Phase 2: Storage — Dual Embedding Generation

### 2.1 Update `memory_store` Tool

**New behavior:**

1. Generate `text_vector` via Harrier
2. Generate `multi_vector` via ImageBind (text input)
3. Check duplicates in **both** vector spaces
4. Store with both vectors

**Duplicate detection:**

- Text similarity threshold: 0.95 (Harrier)
- Multimodal similarity threshold: 0.90 (ImageBind)
- Block if **either** exceeds threshold

### 2.2 Media Storage Strategy

**Decision: External file references** (recommended over inline base64)

```
~/.openclaw/memory/
├── lancedb/
│   └── memories.lance/          ← LanceDB database (vectors + metadata)
└── media/
    ├── images/
    │   ├── <uuid>.png
    │   └── <uuid>.jpg
    ├── audio/
    │   └── <uuid>.wav
    └── spatial/
        └── <uuid>.json
```

**Media reference in DB:**

```json
{
  "media": {
    "image": "media/images/abc123.png",
    "audio": "media/audio/def456.wav"
  }
}
```

### 2.3 Update Auto-Capture

**New capture capabilities:**

1. **Text capture** (existing) — Harrier + ImageBind embeddings
2. **Image capture** — Extract images from conversations, embed with ImageBind
3. **Audio capture** — Extract voice messages, embed with ImageBind
4. **Spatial capture** — Device orientation, location context

**Capture heuristics:**

- Max 3 captures per conversation (existing)
- Image capture: screenshots, shared images, diagrams
- Audio capture: voice messages, spoken preferences
- Spatial capture: location-based memories, AR/VR context

---

## Phase 3: Search & Recall — Dual Vector Fusion

### 3.1 Dual-Vector Search Algorithm

```typescript
async function searchMemories(query: string, limit: number, minScore: number) {
  // 1. Embed query with both models
  const textVector = await harrier.embed(query);
  const multiVector = await imagebind.embed(query);

  // 2. Search both vector spaces
  const textResults = await db.search("text_vector", textVector, limit * 2);
  const multiResults = await db.search("multi_vector", multiVector, limit * 2);

  // 3. Fuse scores
  const fused = fuseScores(textResults, multiResults, {
    text: config.fusionWeights.text,
    multi: config.fusionWeights.multi,
  });

  // 4. Filter by minScore, return top `limit`
  return fused.filter((r) => r.score >= minScore).slice(0, limit);
}
```

### 3.2 Score Fusion Strategy

**Weighted combination:**

```
combined_score = (w_text × text_similarity) + (w_multi × multi_similarity)
```

**Default weights:**

- Text queries: `w_text = 0.6`, `w_multi = 0.4`
- Image queries: `w_text = 0.3`, `w_multi = 0.7`
- Audio queries: `w_text = 0.2`, `w_multi = 0.8`

**Configurable via:** `search.fusionWeights`

### 3.3 Updated `memory_recall` Tool

**New behavior:**

1. Accept optional `modality` filter: `text`, `image`, `audio`, `spatial`, `all`
2. Search both vector spaces with fusion
3. Return results with media attachments (if any)
4. Include similarity scores for both vector spaces

**Response format:**

```json
{
  "memories": [
    {
      "id": "uuid",
      "text": "User prefers dark mode",
      "modality": "text",
      "score": 0.85,
      "textScore": 0.92,
      "multiScore": 0.78,
      "media": null,
      "importance": 0.7,
      "category": "preference",
      "createdAt": 1712345678000
    },
    {
      "id": "uuid",
      "text": "VS Code settings screenshot",
      "modality": "image",
      "score": 0.72,
      "textScore": 0.65,
      "multiScore": 0.79,
      "media": { "image": "media/images/abc123.png" },
      "importance": 0.8,
      "category": "preference",
      "createdAt": 1712345678000
    }
  ]
}
```

### 3.4 Auto-Recall Enhancement

**Updated `before_agent_start` hook:**

1. Embed user message with both models
2. Search both vector spaces with fusion
3. Return top 3 memories (mixed modalities)
4. Inject into context with modality markers

**Context injection format:**

```xml
<relevant-memories>
  <memory modality="text" score="0.85">
    [preference] User prefers dark mode in VS Code
  </memory>
  <memory modality="image" score="0.72">
    [preference] VS Code settings screenshot (attached)
    <media type="image" path="media/images/abc123.png"/>
  </memory>
</relevant-memories>
```

---

## Phase 4: DeepSeek-VL Integration (Future)

### 4.1 Vision

Add **DeepSeek-VL** (not VL2) as a third embedding stream for specialized document understanding:

- Charts, graphs, diagrams
- PDFs with complex layouts
- Technical documentation
- Screenshots with UI elements

### 4.2 Architecture Extension

```
Memory Entry (extended):
├── text_vector:    1024-dim (Harrier)
├── multi_vector:   1024-dim (ImageBind)
└── doc_vector:     1024-dim (DeepSeek-VL)  ← new
```

### 4.3 Implementation Steps

1. **Add DeepSeek-VL runtime loader** (`deepseek-vl-runtime.ts`)
2. **Add `document` modality** to schema
3. **Add `doc_vector` column** to LanceDB
4. **Add `memory_store_document` tool** for PDF/chart ingestion
5. **Update search** to include document vector space
6. **Add `memory_recall_documents` tool** for document-specific search

### 4.4 Search Fusion (Three-Way)

```
combined_score = (w_text × text_sim) + (w_multi × multi_sim) + (w_doc × doc_sim)
```

**Default weights for document queries:**

- `w_text = 0.3`, `w_multi = 0.3`, `w_doc = 0.4`

---

## File Structure

```
extensions/memory-lancedb/
├── index.ts                    # Main plugin entry (updated)
├── config.ts                   # Config schema (updated)
├── api.ts                      # Plugin API barrel
├── cli-metadata.ts             # CLI metadata
├── lancedb-runtime.ts          # LanceDB runtime loader (existing)
├── harrier-runtime.ts          # Harrier runtime loader (new)
├── imagebind-runtime.ts        # ImageBind runtime loader (new)
├── deepseek-vl-runtime.ts      # DeepSeek-VL runtime loader (future)
├── embeddings/
│   ├── harrier.ts              # HarrierEmbeddings class (new)
│   ├── imagebind.ts            # ImageBindEmbeddings class (new)
│   └── deepseek-vl.ts          # DeepSeekVLEmbeddings class (future)
├── memory-db.ts                # MemoryDB class (updated)
├── search/
│   ├── fusion.ts               # Score fusion algorithm (new)
│   └── ranking.ts              # Result ranking (new)
├── media/
│   ├── storage.ts              # Media file storage (new)
│   └── extraction.ts           # Media extraction from conversations (new)
├── tools/
│   ├── memory-recall.ts        # Updated recall tool
│   ├── memory-store.ts         # Updated store tool
│   ├── memory-forget.ts        # Updated forget tool
│   └── memory-recall-multimodal.ts  # New multimodal recall tool
├── hooks/
│   ├── before-agent-start.ts   # Updated auto-recall hook
│   └── agent-end.ts            # Updated auto-capture hook
├── package.json                # Updated dependencies
└── openclaw.plugin.json        # Updated manifest
```

---

## Dependencies

### Runtime Dependencies (auto-installed)

| Package                     | Purpose                     | Version                 |
| --------------------------- | --------------------------- | ----------------------- |
| `@lancedb/lancedb`          | Vector database             | ^0.27.2 (existing)      |
| `@huggingface/transformers` | Harrier model inference     | latest                  |
| `onnxruntime-node`          | ONNX runtime for Harrier    | latest                  |
| `imagebind`                 | ImageBind model inference   | custom wrapper          |
| `deepseek-vl`               | DeepSeek-VL model inference | custom wrapper (future) |

### System Requirements

| Component   | Minimum                  | Recommended          |
| ----------- | ------------------------ | -------------------- |
| **CPU**     | 4 cores                  | 8+ cores             |
| **RAM**     | 8 GB                     | 16+ GB               |
| **GPU**     | Optional (CPU inference) | NVIDIA GPU with CUDA |
| **Storage** | 2 GB (models + DB)       | 10+ GB (with media)  |

---

## Migration Strategy

### 1. Backward Compatibility

- Existing text-only memories remain functional
- New dual-vector fields are optional (nullable)
- Search falls back to text-only if multimodal model unavailable

### 2. Migration Script

```bash
openclaw ltm migrate --add-multimodal
```

**Steps:**

1. Add `multi_vector` column to existing `memories` table
2. Re-embed all existing text memories with ImageBind
3. Update schema version in config

### 3. Rollout Strategy

1. **Phase 1** — Dual embedding infrastructure (no breaking changes)
2. **Phase 2** — Enable dual-vector storage for new memories
3. **Phase 3** — Enable dual-vector search (configurable)
4. **Phase 4** — Enable auto-capture for images/audio (opt-in)

---

## Testing Strategy

### Unit Tests

| Test                        | Coverage                                         |
| --------------------------- | ------------------------------------------------ |
| `harrier-runtime.test.ts`   | Runtime loading, auto-install fallback           |
| `imagebind-runtime.test.ts` | Runtime loading, auto-install fallback           |
| `harrier.test.ts`           | Text embedding, dimension validation             |
| `imagebind.test.ts`         | Text/image/audio embedding, dimension validation |
| `fusion.test.ts`            | Score fusion algorithm, weight tuning            |
| `ranking.test.ts`           | Result ranking, deduplication                    |
| `storage.test.ts`           | Media file storage, reference management         |

### Integration Tests

| Test                              | Coverage                          |
| --------------------------------- | --------------------------------- |
| `memory-store-dual.test.ts`       | Store with both embeddings        |
| `memory-recall-dual.test.ts`      | Recall with dual-vector search    |
| `memory-forget-dual.test.ts`      | Delete with dual-vector cleanup   |
| `auto-recall-multimodal.test.ts`  | Auto-recall with mixed modalities |
| `auto-capture-multimodal.test.ts` | Auto-capture images/audio         |

### Live Tests

| Test                              | Coverage                              |
| --------------------------------- | ------------------------------------- |
| `memory.live.test.ts`             | Real model inference, end-to-end flow |
| `cross-modal-search.live.test.ts` | Text→image, image→text search         |

---

## Risks & Mitigations

| Risk                                      | Impact | Mitigation                                                     |
| ----------------------------------------- | ------ | -------------------------------------------------------------- |
| **Model inference too slow**              | High   | Use CPU-optimized models, cache embeddings, async processing   |
| **GPU required for ImageBind**            | Medium | Provide CPU fallback, document GPU requirements                |
| **Storage bloat from media**              | Medium | External file storage, configurable retention, compression     |
| **Duplicate detection false positives**   | Low    | Tunable thresholds, manual review mode                         |
| **Breaking changes to existing memories** | High   | Backward-compatible schema, migration script, rollback support |

---

## Success Metrics

| Metric                          | Target                           |
| ------------------------------- | -------------------------------- |
| **Text recall accuracy**        | ≥ 90% (Harrier MTEB v2 SOTA)     |
| **Cross-modal recall accuracy** | ≥ 80% (ImageBind unified space)  |
| **Embedding latency (text)**    | < 100ms (Harrier 0.6B)           |
| **Embedding latency (image)**   | < 500ms (ImageBind)              |
| **Search latency**              | < 200ms (LanceDB vector search)  |
| **Storage overhead**            | < 2x (dual vectors + media refs) |

---

## Open Questions

1. **Model deployment** — Local GPU inference or API-based? (Recommend: local with CPU fallback)
2. **Media storage** — External files (recommended) or inline base64?
3. **Score fusion weights** — Default text:multimodal ratio? (Recommend: 0.6:0.4)
4. **Priority** — Start with text+image (Phase 1-3) or include audio/spatial from start?
5. **DeepSeek-VL timeline** — Phase 4 (future) or parallel with Phase 1?

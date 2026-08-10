# Ollama Local Embeddings for RAG — Design

**Date:** 2026-08-10  
**Status:** Approved (user Ok)  
**Parent:** v6 P19.4 — optional Ollama embeddings path  
**Phase:** P23  
**Scope:** Auto-select Ollama embeddings when chat provider is Ollama and no OpenAI key; unified 768-dim pgvector; manual re-index per document

## 1. Problem

RAG semantic search requires embeddings. Today only OpenAI `text-embedding-3-small` (1536 dim) is supported. Users running **100% local stack** (Ollama for chat) stay on **fallback** — first N chunks, not semantic similarity.

## 2. User decisions (brainstorming)

| Decision | Choice |
|----------|--------|
| Provider mode | **Auto (C):** OpenAI key present → OpenAI embeddings; else if `default_provider=ollama` → Ollama; else fallback |
| Ollama model | **Fixed:** `nomic-embed-text` (768 dimensions) |
| Existing documents | **Manual re-index (A):** per-document button, no bulk auto job |

## 3. Goals

1. Generate embeddings via Ollama `/api/embeddings` when auto-resolver picks Ollama.
2. Keep OpenAI embeddings as higher-priority path when user/env key exists.
3. Unify storage to **768-dim** pgvector (OpenAI uses `dimensions: 768` on `text-embedding-3-small`).
4. Track `documents.embedding_provider` so search never mixes incompatible vector spaces.
5. UI shows honest RAG mode: semantic (OpenAI) / semantic (Ollama) / fallback.
6. `POST /documents/:id/reindex` re-embeds existing chunks without re-upload.

## 4. Non-goals

- Configurable embedding model in Settings UI (fixed `nomic-embed-text`; env override OK for ops).
- Automatic bulk re-index on settings change.
- Mixing OpenAI and Ollama vectors in one similarity query.
- New LLM providers for chat.
- BullMQ / background re-index queue.

## 5. Architecture

```
DocumentService / ChatService
  → resolveEmbeddingContext(userId)     // { provider, openaiKey?, ollamaHost? }
  → EmbeddingService
       → OpenAiEmbeddingProvider        // existing logic, dimensions: 768
       → OllamaEmbeddingProvider         // POST /api/embeddings
  → pgvector search (filter by embedding_provider)
```

**Resolver logic (auto C):**

```
1. openaiKey = resolveOpenAiApiKey(userId)  // user enc → env
   if openaiKey valid → provider = 'openai'
2. else load settings.defaultProvider
   if defaultProvider === 'ollama' && defaultOllamaHost resolvable → provider = 'ollama'
3. else → provider = 'none' (fallback chunk selection)
```

Priority: **OpenAI key always wins** over Ollama, even when chat provider is Ollama (hybrid: Ollama chat + OpenAI embed is allowed).

## 6. Ollama embeddings API

| Item | Value |
|------|--------|
| Endpoint | `{ollama_base}/api/embeddings` |
| Base URL | Derived from `default_ollama_host` (strip `/v1/chat/completions`) |
| Model | `nomic-embed-text` (env `OLLAMA_EMBED_MODEL`, default fixed) |
| Request | `{ "model": "nomic-embed-text", "prompt": "<text>" }` |
| Batch | Sequential or small parallel batches (Ollama accepts one prompt per call; batch = loop) |
| SSRF | Reuse `assertAllowedHttpUrl` / `urlAllowlist` (same as chat Ollama) |
| Timeout | 30s single, 60s batch |
| Docker default | `http://host.docker.internal:11434` (via settings host) |

Helper: `resolveOllamaEmbeddingsUrl(ollamaHost: string): Promise<string>`.

## 7. Data model

### 7.1 Migration `20260810120000_embedding_768_ollama`

1. Drop HNSW index on `document_chunks.embedding`.
2. `UPDATE document_chunks SET embedding = NULL`.
3. `UPDATE documents SET embeddings_count = 0`.
4. `ALTER TABLE document_chunks ALTER COLUMN embedding TYPE vector(768)` (via cast drop/recreate if needed).
5. Recreate HNSW index on `embedding`.
6. Add `documents.embedding_provider VARCHAR(20) NULL` — values: `'openai'`, `'ollama'`, `NULL`.

### 7.2 Prisma

```prisma
model Document {
  embeddingProvider String? @map("embedding_provider") @db.VarChar(20)
  // ...
}
model DocumentChunk {
  embedding Unsupported("vector(768)")?
}
```

**Breaking change:** existing 1536-dim embeddings invalidated; users re-index manually.

## 8. Backend changes

### 8.1 New files

| File | Responsibility |
|------|----------------|
| `backend/src/services/embeddings/types.ts` | `EmbeddingProvider`, `EmbeddingContext`, constants |
| `backend/src/services/embeddings/resolveEmbeddingContext.ts` | Auto C resolver |
| `backend/src/services/embeddings/OpenAiEmbeddingProvider.ts` | OpenAI API (768 dim) |
| `backend/src/services/embeddings/OllamaEmbeddingProvider.ts` | Ollama `/api/embeddings` |
| `backend/src/utils/ollamaEmbeddingsUrl.ts` | Chat URL → embeddings URL + allowlist |

### 8.2 Modified files

| File | Change |
|------|--------|
| `EmbeddingService.ts` | Delegate to provider from context; `isAvailable(ctx)` |
| `DocumentService.ts` | Pass context to embed; set `embeddingProvider`; add `reindexEmbeddings()` |
| `ChatService.ts` | Resolve context for query embedding + filter by provider |
| `documentsController.ts` | `POST /:id/reindex` handler |
| `documents.ts` routes | Wire reindex route |
| `settingsController.ts` | Add computed `rag_embedding_mode` on GET |

### 8.3 Re-index flow

`POST /api/documents/:id/reindex` (auth required):

- Document owned by user, `status = 'ready'`.
- Load all chunks ordered by `chunk_index`.
- Resolve current embedding context.
- If provider is `'none'` → `409` with message «Немає доступного провайдера embeddings».
- Delete existing chunk embeddings (UPDATE embedding = NULL).
- Regenerate batch embeddings from chunk `content`.
- Update `embeddings_count`, `embedding_provider`.
- Return `{ document, embeddingsCount }`.

**Distinct from retry:** `retry` = failed upload + staging file; `reindex` = ready doc + chunks in DB.

### 8.4 Search filter

`findRelevantChunks(queryEmbedding, userId, documentIds, limit, { embeddingProvider })`:

- Vector path only when `queryEmbedding` and provider match.
- SQL adds `AND d.embedding_provider = $N` when provider set.
- Documents with `embedding_provider IS NULL` or mismatch → excluded from vector search (fallback still returns their chunks if no vector hits).

## 9. API surface

### GET `/api/settings` — add field

```json
{
  "rag_embedding_mode": "openai" | "ollama" | "fallback"
}
```

Computed server-side from resolver (not persisted).

### Document public shape — add

```json
{
  "embedding_provider": "openai" | "ollama" | null,
  "needs_reindex": true | false
}
```

`needs_reindex`: `embeddings_count === 0` OR `embedding_provider !== current resolved provider`.

### POST `/api/documents/:id/reindex`

- **202/200:** success with updated document.
- **404:** not found / not owned.
- **409:** no embedding provider / Ollama unreachable (optional preflight).

## 10. Frontend

### Settings.tsx

- Replace OpenAI-only warning with three-state copy:
  - `rag_embedding_mode === 'ollama'`: «RAG: семантичний пошук через Ollama (nomic-embed-text)»
  - `openai`: existing OpenAI message
  - `fallback`: existing fallback warning
- Note: auto mode — no extra toggle.

### DocumentModal.tsx

- Badge from `rag_embedding_mode` (prop from settings), not only `has_openai_api_key`.
- Show `embedding_provider` on doc row when ready.
- Button **«Переіндексувати»** when `needs_reindex === true` (not only failed status).
- Toast on reindex success/failure.

### api.ts / types

- `settingsAPI`, `documentsAPI.reindex(id)`.
- Extend `Settings`, `DocumentRecord` types.

## 11. Env / Docker / docs

`backend/.env.example`:

```env
OLLAMA_EMBED_MODEL=nomic-embed-text
EMBEDDING_DIMENSIONS=768
```

README Docker section:

- Pull model: `ollama pull nomic-embed-text`
- RAG auto: Ollama embeddings when provider=ollama and no OpenAI key
- Re-index existing docs after enabling Ollama

## 12. Testing

| Suite | Cases |
|-------|-------|
| `resolveEmbeddingContext.test.ts` | openai key → openai; no key + ollama provider → ollama; neither → none |
| `OllamaEmbeddingProvider.test.ts` | URL derive, SSRF reject, success mock |
| `EmbeddingService.test.ts` | update dimensions 768; provider delegation |
| `DocumentService.test.ts` | reindex from chunks; sets embedding_provider |
| `documents.test.ts` | POST reindex 200/404/409 |
| `DocumentModal.test.tsx` | reindex button visible when needs_reindex |
| `Settings.test.tsx` | rag_embedding_mode values |

## 13. Exit criteria (P23)

- [ ] User with Ollama provider, no OpenAI key: upload → `embeddings_count > 0`, `embedding_provider = ollama`.
- [ ] Chat RAG uses vector search (log: «векторний пошук») with Ollama-only setup.
- [ ] User with OpenAI key: still uses OpenAI embeddings (768 dim).
- [ ] Re-index button works on docs uploaded before Ollama path existed.
- [ ] Badge shows correct mode in Settings and DocumentModal.
- [ ] All backend + frontend tests pass.

## 14. Risks

| Risk | Mitigation |
|------|------------|
| Dimension migration breaks prod DB | Migration nulls embeddings first; document in README |
| Ollama model not pulled | Clear 502/409 error «Запустіть: ollama pull nomic-embed-text» |
| Slow batch embed on large docs | Existing background finalize pattern; log progress |
| Mixed provider docs | Filter by `embedding_provider`; `needs_reindex` prompts user |

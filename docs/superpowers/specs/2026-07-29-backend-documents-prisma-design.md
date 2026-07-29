# Documents Module — Prisma + TypeScript Migration

## Overview

Incrementally migrate the Documents / RAG upload API (`/api/documents`) from CommonJS + `pg` to TypeScript + Prisma, following Pattern A with an explicit service layer. Preserve multer upload, UTF-8 filename decoding, chunking/parsing, and embedding writes. Remove runtime `CREATE TABLE IF NOT EXISTS`. Vector columns remain `Unsupported("vector")` in Prisma — write embeddings via `$executeRaw` only when present.

## Goals

- `routes/documents.ts` + `documentsController.ts` + `DocumentService.ts`
- Prisma for `Document` / `DocumentChunk` metadata; `$executeRaw` for `embedding::vector` inserts
- Drop `ensureTablesExist` and any runtime DDL
- Keep multer config, `decodeMulterFilename`, and HTTP contract parity (including DELETE non-digit → **400**)
- Snake_case document JSON (+ `chunks_count` on list)
- Unit tests with mocked Prisma / EmbeddingService
- No new Prisma schema migrations
- Leave `EmbeddingService.js` and chat RAG query path on `pg` for a later slice

## Out of Scope

- Rewriting `EmbeddingService.findRelevantChunks` / chat RAG to Prisma
- Frontend changes
- Migrating `middleware/auth.js` or `utils/multerFilename.js` to TypeScript
- ESM / Big Bang backend conversion
- Changing allowed MIME types, size limit (10MB), or chunking algorithm
- Storing raw file bytes on disk (memory upload stays)

## Architecture

```
server.js (JS + ts-node)
  └─ routes/documents.ts
       ├─ auth + multer.single('file')
       ├─ decodeMulterFilename on upload
       └─ documentsController.ts
            └─ DocumentService.ts
                 ├─ extractText / chunkText (pdf-parse, mammoth, utf-8 text)
                 ├─ prisma.document.create
                 ├─ per chunk: prisma.documentChunk.create OR $executeRaw (...::vector)
                 ├─ list: prisma.document.findMany + _count.chunks → chunks_count
                 └─ delete: prisma.document.deleteMany({ id, userId }) → FK CASCADE chunks
```

| Action | Path |
|--------|------|
| Create | `backend/src/routes/documents.ts` |
| Create | `backend/src/controllers/documentsController.ts` |
| Create | `backend/src/services/DocumentService.ts` |
| Update | `backend/src/__tests__/documents.test.ts` (replace/port `.js`) |
| Update | `backend/src/__tests__/DocumentService.test.ts` (replace/port `.js`) |
| Delete | `backend/src/routes/documents.js`, `backend/src/services/DocumentService.js` |
| Keep | `utils/multerFilename.js`, `services/EmbeddingService.js`, `middleware/auth.js` |

Uses existing `config/prisma.ts`. Schema already has `Document` / `DocumentChunk` with `onDelete: Cascade`.

## API Contract

All endpoints require `auth`.

### POST `/api/documents/upload`

- Multer memory storage, 10MB, allow pdf / docx / txt / md (MIME or extension)
- No file → 400 `{ error: 'Будь ласка, виберіть файл для завантаження' }`
- Decode `originalname` via `decodeMulterFilename`
- Extract text; empty → 400 with extract-text style message (same as today)
- Create document row; chunk; optionally batch embeddings via `EmbeddingService`
- With embedding: `$executeRaw` insert including `embedding` cast to `vector`
- Without embedding: Prisma `documentChunk.create` (content only)
- `201` → `{ document: <snake_case row>, chunksCount, message: 'Файл успішно опрацьовано та збережено для RAG' }`

### GET `/api/documents`

- Documents for `userId`, newest first
- Each row snake_case including `chunks_count` (integer)

### DELETE `/api/documents/:id`

- If `id` is not `/^\d+$/` → **400** `{ error: 'Некоректний ідентифікатор документа' }` (preserve current status, not 404)
- `deleteMany({ where: { id, userId } })`; `count === 0` → 404
- Success → `{ success: true, message: 'Документ успішно видалено' }`
- Chunks removed by FK CASCADE (no app-level chunk delete loop)

## Data Mapping

| Prisma | JSON |
|--------|------|
| `userId` | `user_id` |
| `fileType` | `file_type` |
| `fileSize` | `file_size` |
| `createdAt` | `created_at` |
| `_count.chunks` | `chunks_count` |
| `id`, `filename` | unchanged |

`toPublicDocument` (+ optional count) lives in the service or controller.

## Error Handling

- 401 from `auth.js`
- 400 multer / missing file / bad id / empty extract
- 404 delete not found / not owned
- 500 unexpected + `logger.error`
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma (and EmbeddingService where needed). Cover:

1. GET list returns snake_case + `chunks_count`
2. DELETE success via `deleteMany` with `userId`
3. DELETE `123abc` → 400 (no Prisma call)
4. DELETE missing → 404
5. DocumentService: chunkText / extractText basics; upload path creates document + chunks; `$executeRaw` used when embedding present; no `ensureTablesExist` / DDL

Do not call real OpenAI in unit tests.

## Implementation Order

1. Port/write failing tests for routes + service
2. Implement `DocumentService.ts` + controller + routes
3. Delete JS counterparts; remove DDL
4. Tests green + `tsc --noEmit`
5. Optional smoke upload against running backend

## Done Criteria

- [ ] `documents.js` and `DocumentService.js` removed; TS path in use
- [ ] No runtime `CREATE TABLE` / DDL in documents path
- [ ] Upload / list / delete parity including DELETE 400 for non-digit id
- [ ] Embeddings still written via `$executeRaw` when available
- [ ] Snake_case responses; `chunks_count` on list
- [ ] Documents + DocumentService tests pass; backend build/typecheck passes
- [ ] `EmbeddingService` / chat RAG untouched
- [ ] No new schema migrations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Prisma cannot type `vector` writes | `$executeRaw` only for embedding inserts; metadata via Prisma |
| Accidental camelCase leak | Explicit DTO mappers + assertions |
| Breaking RAG by skipping embeddings | Keep EmbeddingService batch + raw vector insert parity |
| Dual access: chat still on `pg` | Accept temporary dual access; out of scope for this slice |
| Large upload tests | Mock file buffers; do not parse huge PDFs in CI |

## Approach Rationale

Chosen: **Pattern A routes/controller + TypeScript `DocumentService`**, Prisma for CRUD metadata, **`$executeRaw` for vectors**, drop runtime DDL. Rejected inlining all logic into the controller and leaving the service on `pg`.

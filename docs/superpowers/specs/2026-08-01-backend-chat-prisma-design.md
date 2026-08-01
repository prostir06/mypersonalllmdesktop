# Chat Module — Prisma + TypeScript Migration

## Overview

Migrate the Chat API (`/api/chat`) from CommonJS + `pg` to TypeScript + Prisma, following Pattern A with an explicit `ChatService`. Preserve HTTP and SSE parity (send, stream, history, search), move RAG reads off `pool` into `EmbeddingService` via `$queryRaw` (pgvector), and leave LLM provider adapters (`openai` / `ollama` / `providerFactory`) as JavaScript.

## Goals

- `routes/chat.ts` + `chatController.ts` + `ChatService.ts`
- `EmbeddingService.ts` — no `pool` parameter; vector search via Prisma `$queryRaw` / `$queryRawUnsafe`
- Message/conversation persistence and history/search via Prisma `Message` / `Conversation`
- System prompt from `prisma.userSettings` (not raw SQL)
- Remove dead `updateConversation` / `deleteConversation` from the chat controller (owned by `/api/conversations`)
- Keep SSE event shapes: `init`, `token`, `done`, `error`
- Keep existing rate limits on `/send` and `/stream` in `server.js`
- Unit tests with mocked Prisma, EmbeddingService, ProviderFactory
- No new Prisma schema migrations; no frontend changes

## Out of Scope

- Converting `openaiService.js`, `ollamaService.js`, `providerFactory.js` to TypeScript
- Changing LLM tool-calling / vision semantics
- Frontend API client changes (parity assumed)
- Reworking `/api/conversations` (already Prisma)
- Document upload path (already Prisma `DocumentService`)
- ESM / Big Bang backend conversion

## Architecture

```
server.js (rate limits unchanged)
  └─ routes/chat.ts
       ├─ POST /send              auth → chatController.sendMessage
       ├─ POST /stream            auth → chatController.streamMessage
       ├─ GET  /history/:id       auth → chatController.getHistory
       └─ GET  /search            auth → chatController.searchMessages
            └─ ChatService.ts
                 ├─ ensureOwnedConversation / createConversation
                 ├─ loadRecentMessages / persistTurn
                 ├─ getHistory / searchMessages
                 ├─ buildSystemContext
                 │     → prisma.userSettings (system_prompt)
                 │     → EmbeddingService.generateEmbedding + findRelevantChunks
                 └─ ProviderFactory.sendMessage / streamMessage (JS)
            └─ EmbeddingService.ts
                 └─ $queryRaw pgvector cosine (+ fallback without vectors)
```

| Action | Path |
|--------|------|
| Create | `backend/src/routes/chat.ts` |
| Create | `backend/src/controllers/chatController.ts` |
| Create | `backend/src/services/ChatService.ts` |
| Create | `backend/src/services/EmbeddingService.ts` |
| Create/Update | `backend/src/__tests__/chat*.test.ts`, EmbeddingService tests as needed |
| Delete | `backend/src/routes/chat.js`, `controllers/chatController.js`, `services/EmbeddingService.js` |
| Keep | `openaiService.js`, `ollamaService.js`, `providerFactory.js`, `middleware/auth.js` |

Uses existing `config/prisma.ts`. Schema already has `Conversation`, `Message`, `UserSettings`, `DocumentChunk` (`embedding` as `Unsupported("vector")`).

## API Contract

All endpoints require `auth`. Preserve current status codes and payloads.

### POST `/api/chat/send`

- Body: `{ conversationId?, message, model?, provider?, options? }`
- `message` required; max length 4000 → else 400
- If `conversationId` provided and not owned → 403
- If missing `conversationId` → create conversation (title = first 50 chars of message)
- Build context: recent messages + optional RAG + system prompt
- Call `ProviderFactory.sendMessage`
- Persist user + assistant messages; bump conversation `updatedAt`
- JSON success shape unchanged from current controller

### POST `/api/chat/stream`

- Same prep as send (validation, ownership, context)
- Headers: `text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Events (JSON in `data:` lines):
  - `{ type: 'init', conversationId }`
  - `{ type: 'token', token }`
  - `{ type: 'done', messageId, content }`
  - `{ type: 'error', error }` if failure after headers started
- Tools disabled during stream (same as today)
- Persist final assistant content after stream completes

### GET `/api/chat/history/:conversationId`

- Query: `limit` (cap 500), `offset`
- Ownership check → 404 if missing/foreign
- Response: `{ messages: [{ id, role, content, created_at }], ... }` matching current shape (preserve exact JSON keys used by frontend)

### GET `/api/chat/search?q=&conversationId=`

- `q` trimmed length < 2 → 400 with existing Ukrainian error string
- Search `messages` joined to owned `conversations`; optional filter by `conversationId`
- Response array shape parity with current route (ids, content snippets, conversation title fields as today)

## Data & RAG

| Concern | Approach |
|---------|----------|
| Messages | `prisma.message.create` / `findMany` ordered by `createdAt` |
| Conversations | `prisma.conversation.create` / `findFirst` with `userId` |
| Settings | `prisma.userSettings.findUnique({ where: { userId } })` → `systemPrompt` |
| Vector search | `$queryRaw` / `$queryRawUnsafe` with `embedding <=> $vec::vector` and user/document filters |
| No embedding / no key | Existing fallback: first N chunks (preserve behavior) |

Snake_case at HTTP boundary for history/search fields that are snake_case today. Internal service may use camelCase Prisma objects + mappers.

## Error Handling

- 400 validation (message, search query)
- 401 auth middleware
- 403 forbidden conversation on send/stream
- 404 history not found
- 500 unexpected; stream post-headers uses SSE error event
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma, EmbeddingService, ProviderFactory. Cover:

1. Send creates conversation + two messages when no `conversationId`
2. Send/stream returns 403 for foreign conversation
3. History ownership 404; success returns snake_case `created_at`
4. Search short query → 400; success path calls Prisma (or service) with user scope
5. `buildSystemContext` / RAG invokes EmbeddingService without `pool`
6. Stream writes `init` then tokens (mock streaming provider)

Avoid live OpenAI/Ollama in unit tests.

## Implementation Order

1. Failing tests for ChatService / controller / EmbeddingService contracts
2. Implement `EmbeddingService.ts` (`$queryRaw`, no pool)
3. Implement `ChatService.ts` + controller + routes; wire ProviderFactory
4. Delete JS chat route/controller and old EmbeddingService
5. Green tests + `tsc --noEmit`; optional SSE smoke against running backend

## Done Criteria

- [ ] `chat.js`, `chatController.js`, `EmbeddingService.js` removed
- [ ] Four chat endpoints on TS with HTTP/SSE parity
- [ ] No `pool` in chat or EmbeddingService paths
- [ ] System prompt via Prisma `userSettings`
- [ ] Dead conversation update/delete removed from chat
- [ ] Providers remain JS
- [ ] Chat/Embedding tests pass; backend build/typecheck passes
- [ ] No new schema migrations; no frontend changes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| SSE behavior drift | Port stream headers/events verbatim; focused stream unit test |
| pgvector raw SQL mistakes | Mirror DocumentService cast style; test query args with mocks |
| Dual conversation writers | Chat only creates/updates via Prisma same tables as conversations module |
| Large controller | Force logic into ChatService; controller stays thin |
| Provider JS require from TS | Same `import = require` / `export =` patterns as other modules |

## Approach Rationale

Chosen: **Pattern A + ChatService + EmbeddingService.ts**, providers stay JS, full endpoint parity in one slice. Rejected a fat controller and splitting stream/RAG into a second project (user selected full Chat scope with RAG in-slice).

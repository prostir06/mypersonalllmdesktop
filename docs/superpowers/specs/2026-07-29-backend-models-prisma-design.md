# Models Module — Prisma + TypeScript Migration

## Overview

Incrementally migrate the Models API (`/api/models`) from CommonJS + `pg` to TypeScript + Prisma, following Pattern A (Auth / Settings / Conversations). Preserve full HTTP parity: DB CRUD for `llm_models` plus public Ollama remote discovery via axios. Snake_case JSON for DB responses; keep existing camelCase POST/PUT body field names (`modelId`, `maxTokens`).

## Goals

- `modelsController.ts` + `routes/models.ts` backed by Prisma `LlmModel` for CRUD
- `GET /remote` stays unauthenticated; Ollama discovery via axios (no Prisma)
- Unchanged mount: `server.js` → `require('./routes/models')`
- Snake_case JSON at the HTTP boundary for DB rows
- Owner-scoped update/delete (`userId` in filters); `deleteMany` for delete
- Non-digit `:modelId` → 404
- Unit tests with mocked Prisma and axios
- No new Prisma schema migrations

## Out of Scope

- Chat, documents, users, conversations (already migrated)
- Frontend changes
- Migrating `middleware/auth.js` to TypeScript
- ESM / Big Bang backend conversion
- Separate discovery service module (YAGNI)
- Adding auth to `/remote` or new providers beyond Ollama
- Changing request body field naming (keep camelCase inputs as today)

## Architecture

```
server.js (JS + ts-node)
  └─ routes/models.ts
       ├─ GET  /remote           → listRemoteModels (axios; no auth)
       ├─ GET  /                 → auth → listModels → prisma.llmModel
       ├─ POST /                 → auth → createModel
       ├─ PUT  /:modelId         → auth → updateModel (owner-scoped)
       └─ DELETE /:modelId       → auth → deleteMany({ id, userId })
```

| Action | Path |
|--------|------|
| Create | `backend/src/controllers/modelsController.ts` |
| Create | `backend/src/routes/models.ts` |
| Create | `backend/src/__tests__/models.test.ts` |
| Delete | `backend/src/routes/models.js` |
| Keep | `middleware/auth.js`, Prisma `LlmModel`, `axios` |

Uses existing `config/prisma.ts` singleton. No schema changes — `LlmModel` already maps `llm_models`.

**Route order:** register `GET /remote` before `GET /:modelId` (and before any param route) so Express does not treat `remote` as an id.

## API Contract

### GET `/api/models/remote?provider=&host=`

- No `auth`
- `provider` required → else 400 `{ error: 'provider is required' }`
- Only `ollama` (case-insensitive) supported → else 400 unsupported provider
- Resolve origin from `host` or `OLLAMA_API_URL` / default `http://127.0.0.1:11434/v1/chat/completions`
- Try candidates in order: `/api/tags`, `/v1/models`, `/models`, `/v1/list`, `/v1/engines` (5s timeout each)
- Map hits to `{ id, name }[]`; if none succeed → 502
- Preserve current mapping logic (string or object with `name` | `id` | `model` | `engine`)

### GET `/api/models`

- Requires `auth`
- `findMany` where `OR: [{ userId }, { isDefault: true }]`, `orderBy: { name: 'asc' }`
- Full rows snake_case

### POST `/api/models`

- Requires `auth`
- Body (camelCase, as today): `{ name, modelId, description?, temperature?, maxTokens?, provider? }`
- Defaults: `temperature` 0.7, `maxTokens` 2000, `provider` `'openai'`
- `create` with `userId`; `isDefault` remains false unless DB default says otherwise
- `201` + full snake_case row

### PUT `/api/models/:modelId`

- Requires `auth`
- Parse id; non-digits → 404
- Body: `{ name, description, temperature, maxTokens, provider? }` (camelCase)
- Owner-scoped: find by `id` + `userId`, then update; missing → 404
- Full snake_case row

### DELETE `/api/models/:modelId`

- Requires `auth`
- Parse id; non-digits → 404
- `prisma.llmModel.deleteMany({ where: { id, userId } })`; `count === 0` → 404; else `{ success: true }`
- Do not delete by `id` alone (PK is `id` only; `userId` is optional on the model for defaults)

## Data Mapping

| Prisma | JSON |
|--------|------|
| `userId` | `user_id` |
| `modelId` | `model_id` |
| `maxTokens` | `max_tokens` |
| `isDefault` | `is_default` |
| `createdAt` | `created_at` |
| `temperature` | `temperature` as `number` via `Number(...)` |
| `id`, `name`, `description`, `provider` | unchanged |

Helpers `toPublicModel` live in the controller — no separate service layer.

**Request bodies** stay camelCase (`modelId`, `maxTokens`) to match the current frontend/API consumers.

## Error Handling

- Unauthenticated CRUD → `auth.js` (401)
- Not found / wrong owner / non-digit id → 404
- Remote validation → 400; Ollama unreachable → 502
- Other failures → `logger.error` + 500
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma and axios. Cover:

1. List returns user + default models, snake_case keys, correct `OR` / `orderBy`
2. Create maps camelCase body → Prisma fields, returns snake_case
3. Update / delete ownership → 404 when not owned
4. Delete uses `deleteMany` with `userId`
5. Non-digit `:modelId` → 404
6. Remote: mocked success; missing provider → 400; all candidates fail → 502

Existing Jest + ts-jest setup applies.

## Implementation Order

1. Write failing `models.test.ts`
2. Implement controller + routes + mappers + remote discovery
3. Delete `models.js`
4. Tests green + `tsc --noEmit`
5. Optional smoke against running backend / Ollama

## Done Criteria

- [ ] `models.js` removed; TS route/controller in use
- [ ] All five endpoints on TS with parity above
- [ ] `/remote` remains unauthenticated
- [ ] DB responses snake_case; request bodies camelCase preserved
- [ ] Non-digit ids → 404; delete owner-scoped via `deleteMany`
- [ ] Models tests pass; backend build/typecheck passes
- [ ] No new schema migrations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental camelCase leak in DB responses | Explicit DTO mappers + key assertions |
| Delete by `id` alone (can hit defaults / other users) | Always include `userId` in delete/update filters |
| `/remote` shadowed by `/:modelId` | Register `/remote` first |
| Decimal serialization | Coerce with `Number(...)` |
| Flaky remote tests | Mock axios; never hit real Ollama in unit tests |

## Approach Rationale

Chosen: **Pattern A (controller + routes TS)** with full parity including public `/remote`, keeping axios inline in the controller. Rejected fat routes-only and a premature dedicated discovery service (YAGNI).

# Conversations Module — Prisma + TypeScript Migration

## Overview

Incrementally migrate the Conversations API (`/api/conversations`) from CommonJS + `pg` to TypeScript + Prisma, following Pattern A (Auth / Settings). Preserve full HTTP parity including export formats, snake_case JSON, and ownership checks. Delete uses a single Prisma `delete` so related messages are removed via existing FK `ON DELETE CASCADE`.

## Goals

- `conversationsController.ts` + `routes/conversations.ts` backed by Prisma `Conversation` (+ `Message` for export)
- Unchanged mount: `server.js` → `require('./routes/conversations')`
- Snake_case JSON at the HTTP boundary
- Full parity: list, get, create, update, delete, export (`md` | `json` | `txt`)
- Delete via Prisma + DB CASCADE (no manual message delete / explicit `$transaction`)
- Non-digit `:conversationId` → 404
- Unit tests with mocked Prisma
- No new Prisma schema migrations

## Out of Scope

- Chat routes (`/api/chat/history`, search, streaming) — remain on `pg` until a later slice
- Frontend changes
- Migrating `middleware/auth.js` to TypeScript
- ESM / Big Bang backend conversion
- Shared `conversationService` layer (YAGNI until Chat migrates)
- Changing export payload shapes or adding new formats

## Architecture

```
server.js (JS + ts-node)
  └─ routes/conversations.ts
       ├─ auth.js on all routes
       └─ conversationsController.ts
            ├─ list / get / create / update → prisma.conversation
            ├─ delete → prisma.conversation.deleteMany({ where: { id, userId } })
            │            messages removed by FK ON DELETE CASCADE
            └─ export → conversation + messages → md | json | txt
```

| Action | Path |
|--------|------|
| Create | `backend/src/controllers/conversationsController.ts` |
| Create | `backend/src/routes/conversations.ts` |
| Create | `backend/src/__tests__/conversations.test.ts` |
| Delete | `backend/src/routes/conversations.js` |
| Keep | `middleware/auth.js`, existing Prisma `Conversation` / `Message` models |

Uses existing `config/prisma.ts` singleton. Schema already has `messages.conversation_id` → `conversations.id` with `onDelete: Cascade`.

**Route order:** register `GET /:conversationId/export` before `GET /:conversationId` so Express matches export correctly.

## API Contract

All endpoints require `auth` (same as today). Responses use snake_case.

### GET `/api/conversations`

- `findMany` where `userId = req.userId`, `orderBy: { updatedAt: 'desc' }`
- Body: `{ id, title, created_at, updated_at }[]`

### GET `/api/conversations/:conversationId`

- Parse id; non-digits → 404
- `findFirst` / `findUnique`-style lookup with `id` + `userId`
- Full conversation row snake_case, or 404

### POST `/api/conversations`

- Body: `{ title? }`; default title `Нова розмова` when missing/empty (same as today)
- `create` with `userId`
- `201` + full snake_case row

### PUT `/api/conversations/:conversationId`

- Body: `{ title }`
- Update where `id` + `userId`; Prisma `@updatedAt` refreshes `updated_at`
- Full snake_case row, or 404

### DELETE `/api/conversations/:conversationId`

- Schema PK is `id` only (no `@@unique([id, userId])`), so do **not** delete by `id` alone.
- Use `prisma.conversation.deleteMany({ where: { id, userId } })`; if `count === 0` → 404; else `{ success: true }`.
- Related `messages` removed by DB `ON DELETE CASCADE` (no app-level message deletes).

### GET `/api/conversations/:conversationId/export?format=`

- `format`: `md` (default), `json`, `txt`; unknown → treat as `md` (same as today)
- Load owned conversation + messages (`orderBy: { createdAt: 'asc' }`, fields `role`, `content`, `created_at`)
- `json` → `{ conversation, messages }` (snake_case)
- `txt` → `{ content, format: 'txt', filename }`
- `md` → `{ content, format: 'md', filename }` with the same markdown structure as the current route
- Conversation not found → 404

## Data Mapping

| Prisma | JSON |
|--------|------|
| `userId` | `user_id` |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` |
| `id`, `title` | unchanged |
| Message `conversationId` | `conversation_id` (when included) |

Helpers `toPublicConversation` / list variant and message mappers live in the controller (or tiny adjacent helper) — no separate service module in this slice.

## Error Handling

- Unauthenticated → `auth.js` (401)
- Not found / wrong owner / non-digit id → 404 with existing-style `{ error: '...' }` messages where practical
- Other failures → `logger.error` + 500 / `next(error)` as appropriate
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma. Cover:

1. List ordered by `updatedAt` desc, snake_case keys
2. Get / update / delete ownership → 404 for wrong user or missing
3. Create default title
4. Delete issues owner-scoped delete (messages not manually deleted in app code)
5. Export `json`, `md`, `txt`
6. Non-digit id → 404

Existing Jest + ts-jest setup applies.

## Implementation Order

1. Write failing `conversations.test.ts`
2. Implement controller + routes + mappers
3. Delete `conversations.js`
4. Tests green + `tsc --noEmit`
5. Optional smoke against running backend

## Done Criteria

- [ ] `conversations.js` removed; TS route/controller in use
- [ ] All six endpoints on Prisma with snake_case parity
- [ ] Delete relies on FK CASCADE (no app-level message delete loop)
- [ ] Non-digit ids → 404
- [ ] Conversations tests pass; backend build/typecheck passes
- [ ] No new schema migrations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental camelCase leak | Explicit DTO mappers + key assertions in tests |
| Delete by `id` alone (IDOR) | Always include `userId` in delete/update/get filters; tests for wrong owner |
| Export route shadowed by `/:id` | Register `/export` before `/:conversationId` |
| CASCADE missing in some DBs | Schema baseline already declares CASCADE; no app fallback delete of messages |
| Chat still on `pg` | Out of scope; dual access to same tables is acceptable temporarily |

## Approach Rationale

Chosen: **Pattern A (controller + routes TS)** with full endpoint parity and **Prisma delete + DB CASCADE**. Rejected fat routes-only and a premature shared service layer (YAGNI until Chat migrates).

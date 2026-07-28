# Settings Module — Prisma + TypeScript Migration

## Overview

Incrementally migrate the Settings API (`GET` / `PUT /api/settings`) from CommonJS + `pg` to TypeScript + Prisma, following the same pattern as Auth. Preserve snake_case HTTP contracts, remove runtime `ALTER TABLE`, and include `system_prompt` on GET so the Settings UI can load it.

## Goals

- `settingsController.ts` + `routes/settings.ts` backed by Prisma `UserSettings`
- Unchanged routes mount: `server.js` → `require('./routes/settings')`
- Snake_case JSON responses; map from Prisma camelCase at the HTTP boundary
- GET returns `system_prompt` (minimal contract expansion for Settings page)
- No runtime schema mutations (`ALTER TABLE`)
- Unit tests with mocked Prisma

## Out of Scope

- Frontend changes (GET fix alone unblocks existing `Settings.jsx` / `useSettings`)
- Migrating `settingsValidator.js` or `middleware/auth.js` to TypeScript
- Chat, documents, conversations, or other modules
- ESM / Big Bang backend conversion
- New settings fields beyond the current DB columns

## Architecture

```
server.js (JS + ts-node)
  └─ routes/settings.ts
       ├─ GET  → settingsController.getSettings  → prisma.userSettings
       └─ PUT  → auth.js + settingsValidator.js → settingsController.updateSettings → prisma.userSettings.upsert
```

| Action | Path |
|--------|------|
| Create | `backend/src/controllers/settingsController.ts` |
| Create | `backend/src/routes/settings.ts` |
| Create | `backend/src/__tests__/settings.test.ts` |
| Delete | `backend/src/routes/settings.js` |
| Keep | `validators/settingsValidator.js`, `middleware/auth.js` |

Uses existing `config/prisma.ts` singleton. No schema migration required — `UserSettings` already matches the DB.

## API Contract

### GET `/api/settings`

- Auth optional (same as today): if `Authorization` Bearer JWT verifies, set `userId`; invalid token → warn and treat as anonymous.
- Anonymous / no row → defaults:

```json
{
  "default_model": "gpt-3.5-turbo",
  "temperature": 0.7,
  "max_tokens": 2000,
  "default_provider": "openai",
  "default_ollama_host": "<OLLAMA_API_URL or http://127.0.0.1:11434/v1/chat/completions>",
  "system_prompt": ""
}
```

- Authenticated with row → same six fields from Prisma, snake_case (`system_prompt` included; **change vs old GET** which omitted it).
- On DB error while authenticated → return defaults + `logger.warn` (not 500).

### PUT `/api/settings`

- Requires `auth` middleware + `validateSettingsUpdate` + `handleValidationErrors` (unchanged `.js` validators).
- Body may be partial; merge with existing row or defaults.
- Upsert on `userId`.
- Response: full settings row in snake_case (including `id`, `user_id`, timestamps), equivalent to previous `RETURNING *` shape.
- No `ALTER TABLE` side effects.

## Data Mapping

Prisma fields (`defaultModel`, `temperature` as `Decimal`, etc.) map to API:

| Prisma | JSON |
|--------|------|
| `defaultModel` | `default_model` |
| `temperature` | `temperature` (as `number`) |
| `maxTokens` | `max_tokens` |
| `defaultProvider` | `default_provider` |
| `defaultOllamaHost` | `default_ollama_host` |
| `systemPrompt` | `system_prompt` |
| `userId` | `user_id` |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` (ISO strings as Prisma/JSON normally emit) |

Helpers for `toPublicSettings` (GET subset) and `toSettingsRow` (PUT full row) live in the controller file or a tiny adjacent helper — no separate service layer in this slice.

## Error Handling

- GET: DB failures → defaults + warn
- PUT: validation → 400; unauthenticated → auth middleware; other errors → `next(error)` / 500
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma (and optionally jwt verify for GET). Cover:

1. GET without token → defaults including `system_prompt: ''`
2. GET with user + row → snake_case including `system_prompt`
3. PUT partial update → upsert merge
4. PUT invalid body → 400

Existing Jest + ts-jest setup from the foundation plan applies.

## Implementation Order

1. Write failing `settings.test.ts`
2. Implement controller + routes + mapping
3. Delete `settings.js`
4. Tests green + `tsc --noEmit`
5. Optional smoke GET/PUT against running backend

## Done Criteria

- [ ] `settings.js` removed; TS route/controller in use
- [ ] No runtime `ALTER TABLE` in settings path
- [ ] GET includes `system_prompt`
- [ ] Responses remain snake_case
- [ ] Settings tests pass; backend build/typecheck passes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidental camelCase leak | Explicit DTO mappers + test assertions on keys |
| Decimal serialization quirks | Coerce temperature with `Number(...)` |
| Optional JWT on GET regresses | Port existing verify/fallback logic carefully |
| Docker / ts-node | Same pattern as Auth (already supported) |

## Approach Rationale

Chosen: **Auth-mirrored controller + routes**, keep validator JS, drop ALTER, expand GET with `system_prompt`. Rejected a separate service layer and validator TS migration for this slice (YAGNI).

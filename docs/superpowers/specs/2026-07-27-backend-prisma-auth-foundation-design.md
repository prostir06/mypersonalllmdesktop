# Backend Prisma + Auth Foundation (Incremental)

## Overview

Establish the **incremental** foundation for backend TypeScript + Prisma: full Prisma schema aligned to the existing PostgreSQL database, baseline migration (no data loss), and Auth module migrated to typed Prisma-backed controllers. All other backend modules remain CommonJS JavaScript on the existing `pg` pool until later slices.

This document is the **source of truth for Phase 1 foundation**. The earlier [Backend Architecture Refactoring](./2026-07-27-backend-architecture-design.md) remains the long-term direction (full TS + Prisma); it does **not** mandate a Big Bang for this slice.

Supersedes the earlier local implementation notes on ESM vs CJS and the insecure JWT fallback. Those notes are not in the repository. This spec is the source of truth.

## Goals

- Prisma Client generated from a schema that matches the live DB (`database.sql` + `migrations/`).
- Baseline migrate: mark existing schema as applied without dropping or rewriting data.
- Auth (`register` / `login` / `refresh`) runs on Prisma with unchanged HTTP JSON contracts.
- Hardening: required `JWT_SECRET`; timing-safe login when user is missing.
- Tooling: TypeScript `strict` + `allowJs`, CommonJS via `ts-node`, `ts-jest`, updated `dev`/`start`/`build` scripts.

## Out of Scope

- Converting remaining routes/services/middleware to TypeScript or Prisma (chat, documents, settings, conversations, models, users, `middleware/auth.js`).
- Enabling `"type": "module"` / native ESM for the backend package.
- Frontend changes.
- Replacing Docker Postgres image / pgvector setup beyond what schema modeling requires.
- Big Bang rename of all `.js` → `.ts`.

## Relationship to Existing Docs

| Doc | Role after this spec |
|-----|----------------------|
| `2026-07-27-backend-architecture-design.md` | Long-term target architecture; Big Bang deferred |
| This foundation spec | Binding for Phase 1 implementation |
| Old prisma-auth plan | Obsolete; replace via writing-plans |

## Architecture

```
server.js (JS, ts-node/register)
  └─ routes/auth.ts → authController.ts → config/prisma.ts → PostgreSQL
  └─ other routes/*.js → config/database.js (pg pool) → PostgreSQL
```

- **Dual data access is intentional** for this slice: Auth uses Prisma; everything else keeps `pg`.
- New TypeScript files use `import`/`export` syntax loaded as **CommonJS** (`module: "commonjs"`, no package `"type": "module"`).
- `middleware/auth.js` stays JavaScript and continues setting `req.userId` from JWT.

### Key files

| Action | Path |
|--------|------|
| Create | `backend/prisma/schema.prisma` |
| Create | `backend/src/config/prisma.ts` |
| Create | `backend/src/controllers/authController.ts` |
| Create/rename | `backend/src/routes/auth.ts` (replace `auth.js`) |
| Create | `backend/tsconfig.json` |
| Create/update | Jest config for `ts-jest` |
| Modify | `backend/package.json` scripts + deps |
| Modify | `backend/.env.example` — add `DATABASE_URL` |
| Keep | `backend/src/config/database.js`, non-auth routes |

## Database & Prisma

### Schema source of truth

Hand-write `schema.prisma` from **actual** tables in:

- `backend/database.sql`
- `backend/migrations/` (including `004` pgvector `embedding vector(1536)` on `document_chunks`)

Do **not** copy the outdated model shapes from the old plan blindly (known drift: `user_settings` PK/`default_ollama_host`/`temperature`; documents `file_type`/`file_size`/`created_at`; chunk `chunk_index` + embedding).

Include models needed for the full app surface (User, UserSettings, Conversation, Message, Document, DocumentChunk, and other existing tables such as `llm_models` if present) so later modules can migrate without redoing schema discovery. Auth code in this slice only **uses** `User`.

`DocumentChunk.embedding` remains `Unsupported("vector(1536)")?` (or equivalent); similarity search stays `$queryRaw` in future slices.

### Adoption flow (no data loss)

1. Add `DATABASE_URL` (Prisma). Document how it maps from existing `DB_HOST` / `DB_PORT` / `DB_NAME` / `DB_USER` / `DB_PASSWORD`.
2. Author `schema.prisma` against real DDL.
3. Verify with `prisma db pull` (diff / compare) — fix schema until aligned.
4. Create a **baseline** migration for the current DB state and mark it applied (`prisma migrate resolve` / baseline workflow) so Prisma Migrate tracks history without re-applying DDL that already exists.
5. `prisma generate`.

### Prisma client

`src/config/prisma.ts` exports a singleton `PrismaClient`. In development, attach to `globalThis` to avoid connection exhaustion under reload.

## Auth Module

### Endpoints (unchanged contracts)

- `POST /api/auth/register` → `{ token, userId }` (201)
- `POST /api/auth/login` → `{ token, userId }`
- `POST /api/auth/refresh` → `{ token }`

Validation rules stay equivalent to current `express-validator` chains (email, name length, password complexity).

### Hardening

- If `JWT_SECRET` is missing or empty at token sign/verify time → throw / 500 fail-fast (no `'secret'` fallback).
- Login: when user is not found, still run a bcrypt compare against a dummy hash (or equivalent) before returning the generic invalid-credentials error, to reduce timing side-channels.
- Refresh: verify token (allow expired for refresh as today if that is current behavior), ensure user exists via Prisma, issue new JWT.

### Wiring

`server.js` continues to mount `/api/auth`. With `ts-node/register` (or nodemon+ts-node), it loads `./routes/auth` resolving to `auth.ts`. Delete or stop using `auth.js` after cutover.

## Tooling

| Concern | Choice |
|---------|--------|
| Module system | CommonJS runtime; TS `module: "commonjs"` |
| `allowJs` | `true` — coexist with remaining `.js` |
| `strict` | `true` for new TS |
| Dev | `nodemon --exec ts-node src/server.js` (or equivalent) |
| Start | `node -r ts-node/register src/server.js` (or documented equivalent) |
| Build | `tsc` as typecheck/emit check |
| Tests | `ts-jest` so `.ts` controllers and existing `.js` tests run under `npm test` |

## Error Handling

- Auth keeps explicit status codes in the controller (same UX as today).
- Central Prisma-aware `errorHandler.ts` is **not** required for this slice; optional later.
- Do not change global error middleware behavior beyond what Auth needs.

## Testing

- Auth route/controller tests: successful register; login success; login failure (bad password / unknown user); refresh success and invalid token.
- Prefer mocking `PrismaClient` in unit tests **or** a dedicated test database — implementation plan picks one; behavior assertions must not depend on production DB.
- Existing non-auth Jest tests must still run (allowJs / ts-jest config must not break them).

## Implementation Order

1. Dependencies + `tsconfig` + package scripts.
2. `DATABASE_URL` docs + `schema.prisma` + pull verification + baseline + generate.
3. `prisma.ts` singleton (+ `globalThis` in dev).
4. `authController.ts` + `auth.ts` + wire into `server.js`; remove old `auth.js` handlers.
5. JWT + timing-safe hardening.
6. `ts-jest` + auth tests.
7. Verify done criteria.

## Done Criteria

- [ ] `prisma generate` succeeds; baseline migrate recorded against existing DB without data loss
- [ ] Auth HTTP contracts unchanged and backed by Prisma
- [ ] No `JWT_SECRET || 'secret'` (or similar insecure default)
- [ ] Timing-safe login path for missing users
- [ ] `npm run dev` starts; `npm test` passes including new auth coverage
- [ ] Non-auth routes remain `.js` using `pg` pool

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Schema drift vs real DB | Author from SQL + migrations; verify with `db pull` |
| Dual `pg` + Prisma pools | Document; acceptable for incremental slice |
| `ts-node` loading `.ts` from `.js` server | Explicit `-r ts-node/register` / nodemon exec; smoke require auth router |
| pgvector / Docker | Model as Unsupported; baseline does not recreate existing vector column |
| Doc confusion (Big Bang vs incremental) | This spec governs Phase 1; architecture doc is long-term only |

## Approach Rationale

Chosen: **new foundation design spec + replacement implementation plan**, with **incremental** delivery (Prisma + Auth only), **CommonJS/`ts-node`**, **hand schema + baseline migrate**, and **full hardening + ts-jest** in the same slice. Rejected: Big Bang, ESM package mode, and “errata-only” docs that leave contradictory sources of truth.

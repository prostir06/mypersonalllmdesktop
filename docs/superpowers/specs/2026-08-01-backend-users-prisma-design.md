# Users Module — Prisma + TypeScript Migration

## Overview

Incrementally migrate the profile API (`GET` / `PUT /api/users/me`) from CommonJS + `pg` to TypeScript + Prisma, following Pattern A. Preserve snake_case JSON, never expose `password`, add inline PUT validation and map unique-email conflicts to HTTP 409.

## Goals

- `usersController.ts` + `routes/users.ts` backed by Prisma `User`
- Unchanged mount: `server.js` → `require('./routes/users')`
- GET returns `{ id, name, email, created_at }`; PUT returns `{ id, name, email }` (parity with current responses)
- Never include `password` (or other secrets) in responses
- Inline validation for PUT `name` / `email` → 400
- Prisma `P2002` on email → 409 `{ error: 'Email already in use' }`
- Unit tests with mocked Prisma
- No new Prisma schema migrations

## Out of Scope

- Password change / reset
- Admin user CRUD, listing other users
- Frontend changes
- Migrating `middleware/auth.js` to TypeScript
- express-validator file for users (inline validation only)
- ESM / Big Bang backend conversion
- Chat or other remaining JS modules

## Architecture

```
server.js (JS + ts-node)
  └─ routes/users.ts
       ├─ GET /me → auth.js → usersController.getMe → prisma.user.findUnique
       └─ PUT /me → auth.js → usersController.updateMe → prisma.user.update
```

| Action | Path |
|--------|------|
| Create | `backend/src/controllers/usersController.ts` |
| Create | `backend/src/routes/users.ts` |
| Create | `backend/src/__tests__/users.test.ts` |
| Delete | `backend/src/routes/users.js` |
| Keep | `middleware/auth.js`, Prisma `User` model |

Uses existing `config/prisma.ts`. No schema changes — `User.email` is already `@unique`.

## API Contract

Both endpoints require `auth`.

### GET `/api/users/me`

- `findUnique({ where: { id: req.userId }, select: { id, name, email, createdAt } })`
- Missing → 404 `{ error: 'User not found' }`
- Success → `{ id, name, email, created_at }`

### PUT `/api/users/me`

- Body: `{ name, email }`
- Validation before Prisma:
  - `name` must be a non-empty string (trim) → else 400
  - `email` must be a non-empty string containing `@` and `.` → else 400
- `update({ where: { id: req.userId }, data: { name, email }, select: { id, name, email } })`
- Missing user → 404
- Unique violation on email (`P2002`) → 409 `{ error: 'Email already in use' }`
- Success → `{ id, name, email }` (no `created_at`, matching current PUT)

## Data Mapping

| Prisma | JSON |
|--------|------|
| `createdAt` | `created_at` |
| `id`, `name`, `email` | unchanged |
| `password` | **never** returned |

Helper `toPublicUser` / `toPublicUserUpdate` in the controller.

## Error Handling

- 401 from `auth.js`
- 400 validation failures with clear `{ error }` messages
- 404 user not found
- 409 duplicate email
- 500 unexpected + `logger.error`
- Do not introduce a new global error hierarchy

## Testing

Mock Prisma. Cover:

1. GET `/me` → snake_case profile, no `password`
2. GET missing → 404
3. PUT success → `{ id, name, email }`
4. PUT empty/invalid name or email → 400
5. PUT when Prisma throws `P2002` → 409

Existing Jest + ts-jest setup applies.

## Implementation Order

1. Write failing `users.test.ts`
2. Implement controller + routes + mappers
3. Delete `users.js`
4. Tests green + `tsc --noEmit`
5. Optional smoke against running backend

## Done Criteria

- [ ] `users.js` removed; TS route/controller in use
- [ ] GET/PUT parity with snake_case and no password leakage
- [ ] Inline PUT validation → 400
- [ ] Duplicate email → 409
- [ ] Users tests pass; backend build/typecheck passes
- [ ] No new schema migrations

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Password leak via `select *` / full model | Explicit `select` + mapper tests asserting `not.toHaveProperty('password')` |
| Accidental camelCase `createdAt` | Map to `created_at` + assertion |
| Over-strict email regex | Keep minimal `@` + `.` check; do not invent RFC parser |
| Auth register path also creates users | Out of scope; leave Auth as-is |

## Approach Rationale

Chosen: **Pattern A (controller + routes TS)** with **inline validation** and **409 on P2002**. Rejected fat routes-only and folding profile into `authController` (keeps auth vs profile boundaries clear).

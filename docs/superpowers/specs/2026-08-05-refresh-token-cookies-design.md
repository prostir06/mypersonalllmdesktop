# Refresh-Token Cookies + Short Access JWT — Design

**Date:** 2026-08-05  
**Status:** Implemented  
**Parent:** Project Evolution v2 — P8 item 2  
**Scope:** Replace long-lived `localStorage` JWT with short access JWT in memory + httpOnly refresh cookie (same-origin)

## 1. Problem

Today the app issues a single JWT (`JWT_EXPIRE` default `7d`) stored in `localStorage`. `/auth/refresh` accepts that same Bearer with `ignoreExpiration` and a leeway window — so a stolen access token remains useful for days, and XSS can exfiltrate it from storage.

## 2. Goals

1. **Short access JWT** (default **15m**) held only in React memory.
2. **Opaque refresh token** in an **httpOnly** cookie (`SameSite=Lax`, path scoped to auth), persisted as a **hash** in Postgres with **rotation** on refresh.
3. Silent session restore on page load via `POST /auth/refresh` + `credentials: 'include'`.
4. Logout revokes refresh row and clears cookie.
5. Remove access-token `localStorage` and the old “expired access as refresh” endpoint behavior.

## 3. Non-goals

- Cross-origin cookie mode (`SameSite=None`) — prod assumed same-origin via nginx `/api`.
- Multi-device session management UI.
- Refresh-token encryption at rest beyond hashing (hash is enough for opaque secrets).
- Changing password-reset / email flows.
- Electron/Tauri cookie jar specifics (later desktop track).

## 4. Token model

| | Access | Refresh |
|--|--------|---------|
| Representation | JWT `{ userId }` signed with `JWT_SECRET` | Cryptographically random ≥32 bytes |
| Client storage | Memory (`AuthContext` state) | Cookie `refresh_token` |
| Server storage | Stateless | `refresh_tokens.token_hash` = SHA-256(hex/raw) |
| Default TTL | `JWT_ACCESS_EXPIRE=15m` | `JWT_REFRESH_EXPIRE=30d` |
| Rotation | Re-issued on login/register/refresh | Old row `revokedAt` set; new row + new cookie |

### Cookie attributes

- Name: `refresh_token`
- `HttpOnly`, `SameSite=Lax`, `Path=/api/auth`
- `Secure` when `NODE_ENV === 'production'`
- `Max-Age` aligned with refresh TTL

Dev: Vite proxies `/api` → backend so browser treats cookies as same-site for the SPA origin.

## 5. Data model

Prisma model (name may be `RefreshToken` → table `refresh_tokens`):

- `id` Int PK
- `userId` Int FK → `users` ON DELETE CASCADE
- `tokenHash` String `@unique`
- `expiresAt` DateTime
- `revokedAt` DateTime?
- `createdAt` DateTime
- Index on `userId`

Migration under `backend/prisma/migrations/`.

## 6. API changes

### Login / Register

1. Validate credentials as today.
2. Create refresh row + `Set-Cookie`.
3. Respond `201/200` with `{ token, userId }` where `token` is **access only**.

### `POST /auth/refresh`

- **No** Authorization Bearer required.
- Read `refresh_token` cookie; lookup by hash; reject if missing, expired, or revoked.
- Rotate: revoke current, insert new, set new cookie.
- Respond `{ token: <access> }`.
- Remove `ignoreExpiration` / leeway path on access JWT.

### `POST /auth/logout` (new)

- If cookie present: revoke matching row (if any).
- `clearCookie` with same Path/SameSite/Secure.
- Respond `{ success: true }` (idempotent).

### Auth middleware

- Unchanged: still validates **access** Bearer for protected routes.
- SSE continues to use Authorization header from memory.

## 7. Frontend

| Area | Change |
|------|--------|
| `AuthContext` | Token state only; no `localStorage` for JWT; `boot()` calls refresh on mount |
| `api.ts` | `withCredentials: true` (at least for auth calls; global OK for same-origin `/api`); 401 queue → `/auth/refresh` without sending expired access as body; on fail logout |
| Login/Register | Still `login(data.token)`; cookie set by response |
| Logout | Call `/auth/logout` then clear memory |
| SSE `fetch` | `Authorization: Bearer ${memoryToken}`; credentials optional |

## 8. Env / docs

Update `backend/.env.example` (and root if present):

- `JWT_ACCESS_EXPIRE=15m` (replace or supersede `JWT_EXPIRE` for access)
- `JWT_REFRESH_EXPIRE=30d`
- Deprecate `JWT_REFRESH_LEEWAY_SEC` (remove usage)

Keep `JWT_SECRET` as today (access signing). Optional later: separate `JWT_REFRESH_PEPPER` for hash — YAGNI unless needed.

## 9. Testing

**Backend**

- Login → `Set-Cookie` present; body has access token.
- Refresh with cookie → new access + rotated cookie; old hash rejected.
- Refresh without/invalid cookie → 401.
- Logout → cookie cleared; subsequent refresh 401.

**Frontend**

- Boot without memory token but successful refresh mock → authenticated.
- 401 interceptor triggers single refresh then retries (extend existing axios tests if any; else light Vitest).

## 10. Acceptance

- [ ] No access JWT in `localStorage`
- [ ] Access TTL ≤ 15m default
- [ ] Refresh only via httpOnly cookie + DB rotation
- [ ] Page reload restores session when refresh cookie valid
- [ ] Logout ends refresh usability
- [ ] Backend + frontend tests/lint green

## 11. Follow-ups

- Absolute session lifetime / idle timeout policy
- Per-device revoke list in Profile UI
- Desktop shell cookie handling

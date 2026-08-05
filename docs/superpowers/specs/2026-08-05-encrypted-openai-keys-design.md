# Per-User Encrypted OpenAI API Keys — Design

**Date:** 2026-08-05  
**Status:** Approved for implementation (pending file review)  
**Parent:** Project Evolution v2 — P8 item 4  
**Scope:** Store each user’s OpenAI API key encrypted at rest (server master key); fall back to `OPENAI_API_KEY` env

## 1. Problem

OpenAI calls and embeddings use a single process env `OPENAI_API_KEY`. Multi-user or multi-tenant self-host cannot give each account their own key, and there is no UI to manage secrets. Keys must not be stored or returned in plaintext.

## 2. Goals

1. Per-user OpenAI API key, **AES-256-GCM** encrypted with server `ENCRYPTION_KEY`.
2. Settings UI: set / replace / clear key; show only `has_openai_api_key` (never echo secret).
3. Runtime resolution: **user ciphertext → decrypt → use**; else **`process.env.OPENAI_API_KEY`** (existing placeholder check).
4. Production fail-closed if `ENCRYPTION_KEY` missing when writing/reading encrypted values (or at boot for prod).

## 3. Non-goals

- Password-derived encryption / unlock session
- Electron OS keychain as primary store
- Multiple provider key map (Anthropic, etc.) in v1
- Envelope encryption / KMS / key rotation UI
- Logging or exporting plaintext keys

## 4. Crypto

| Item | Choice |
|------|--------|
| Algorithm | AES-256-GCM |
| Key | `ENCRYPTION_KEY` — 32 raw bytes as **base64** (preferred) or **64 hex chars** |
| IV | 12 random bytes per encryption |
| Storage | `base64(iv \|\| ciphertext \|\| authTag)` in DB column |
| AAD | UTF-8 `user:${userId}` so ciphertext is bound to owner |

Helpers in `backend/src/utils/secretCrypto.ts`: `encryptSecret(plain, userId)`, `decryptSecret(blob, userId)`, `parseEncryptionKey()`.

If `ENCRYPTION_KEY` unset: **cannot** save user keys (400/503 with clear message); decrypt path unused; env fallback still works for chat.

## 5. Data model

Extend `UserSettings` / `user_settings`:

- `openaiApiKeyEnc String? @map("openai_api_key_enc") @db.Text`

Migration under `backend/prisma/migrations/`.

No plaintext column.

## 6. API

### GET `/api/settings` (existing)

Add to public payload:

- `has_openai_api_key: boolean` — true if `openaiApiKeyEnc` non-null/non-empty

Do **not** include decrypted or masked key material beyond the boolean (optional UI hint: last-4 only is **out of scope** for v1 to avoid decrypt on every GET).

### PUT `/api/settings` (existing)

Accept optional:

- `openai_api_key: string` — if present and non-empty after trim → encrypt & store  
- `openai_api_key: ""` or `clear_openai_api_key: true` → set column null  

Omit field → leave existing ciphertext unchanged.

Validation: max length (e.g. 256); reject if looks like placeholder `your_openai_api_key_here`.

### Errors

- Missing/invalid `ENCRYPTION_KEY` when attempting encrypt → `503` / `500` with generic «Помилка конфігурації шифрування» (no key details).

## 7. Runtime resolution

`resolveOpenAiApiKey(userId: number): Promise<string | null>`:

1. Load settings row for user; if enc present → decrypt; return plaintext.
2. Else if env key set and not placeholder → return env.
3. Else null.

Wire:

- Chat/OpenAI path: create OpenAI client **per request** (or pass `apiKey` into service methods) using resolved key — avoid module-level singleton keyed only to boot-time env.
- `EmbeddingService`: same resolver (needs `userId` on upload/RAG paths — already have `userId` in document/chat flows).

## 8. Frontend

- Settings form: password-style input «OpenAI API ключ» + checkbox/button «Очистити збережений ключ»
- Show badge if `has_openai_api_key`
- Do not put key into React Query cache after save (refetch settings → only boolean)
- Ukrainian copy

## 9. Env / Compose / docs

- `backend/.env.example`, root `.env.example`, compose: `ENCRYPTION_KEY=`
- Prod compose: require `ENCRYPTION_KEY` similar to `JWT_SECRET` (or document strongly recommended + runtime check on encrypt)
- README: how to generate (`openssl rand -base64 32`)

## 10. Testing

- Unit: encrypt/decrypt round-trip; wrong userId AAD fails; missing key throws
- Settings API: PUT key → GET has true; PUT clear → has false; GET never contains `sk-`
- OpenAI/embedding resolver prefers user key over env (mocked)

## 11. Acceptance

- [ ] User can save/clear OpenAI key in Settings
- [ ] DB holds only ciphertext
- [ ] API never returns plaintext key
- [ ] Chat/embeddings use user key when set, else env
- [ ] Tests + lint green

## 12. Follow-ups

- Per-provider secrets table
- Key rotation / ENCRYPTION_KEY version byte prefix
- Audit log for key update (no secret content)

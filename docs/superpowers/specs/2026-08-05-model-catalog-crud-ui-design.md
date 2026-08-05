# Model Catalog CRUD UI — Design

**Date:** 2026-08-05  
**Status:** Implemented  
**Parent:** Project Evolution v2 — P8 item 1  
**Scope:** Frontend Settings section + wire default-model picker to `GET /models`

## 1. Problem

Settings still uses a hardcoded `modelOptions` map for OpenAI/Ollama. The backend already exposes a per-user + system-default catalog (`llm_models` via `GET/POST/PUT/DELETE /api/models`), but there is no UI to manage it. Users cannot add custom model IDs (e.g. `gpt-4.1`, local Ollama tags) without code changes.

## 2. Goals

1. Settings section **«Каталог моделей»** with list + create/edit/delete for **own** models.
2. Default provider/model selectors use the catalog (`model_id` / `provider`), not hardcoded lists.
3. System defaults (`user_id == null` and/or `is_default`) visible as **read-only** with a badge.
4. Keep existing Ollama remote discovery behavior (fetched remote list overrides catalog options while present).

## 3. Non-goals

- Separate `/models` route or nav item
- Import remote Ollama models into the catalog in bulk
- Chat-box model picker changes (unless it still hardcodes the same map — out of scope unless trivial shared helper)
- Backend schema changes, Electron/Tauri, encrypted API keys, refresh-cookie auth
- Editing/deleting system default rows (API already forbids; UI must not offer actions)

## 4. Current API (reuse as-is)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/models` | User rows + `isDefault` system rows; snake_case via `toPublicModel` |
| POST | `/api/models` | Body: `name`, `modelId`, `description?`, `temperature?`, `maxTokens?`, `provider?` |
| PUT | `/api/models/:id` | Own rows only (`userId` match) |
| DELETE | `/api/models/:id` | Own rows only |
| GET | `/api/models/remote` | Ollama discovery (unchanged) |

**Wire mismatch:** API create/update expect camelCase (`modelId`, `maxTokens`); list response is snake_case (`model_id`, `max_tokens`). Frontend `modelsAPI` + form mapping must handle both directions. Optional small backend validation (required `name`/`modelId`) is in-scope if create currently 500s on missing fields.

## 5. UX

### 5.1 Default settings block (existing)

- Provider: `openai` | `ollama` (unchanged).
- Model select options:
  - If `provider === 'ollama'` and remote fetch succeeded → remote list (as today).
  - Else → catalog entries where `provider` matches current provider; `value = model_id`, `label = name` (fallback `model_id`).
- On provider change: clear remote list; if current `model` not in new options, pick first option.
- If catalog empty for provider and no remote: empty select + short hint to add a model in the catalog section.

### 5.2 Catalog section (new)

- Table columns: name, model_id, provider, temperature, max_tokens, actions.
- System row: badge «системна»; no Edit/Delete.
- Own row: Edit, Delete (confirm).
- «Додати модель» opens inline form or compact panel: name, model_id, provider, description, temperature, max_tokens.
- Edit: same fields; `model_id` editable if API allows (create uses `modelId`; update currently does **not** change `modelId` — keep model_id read-only on edit to match API, or extend PUT — **prefer read-only on edit** to avoid backend change).

### 5.3 Locale

Ukrainian UI strings, consistent with Settings.

## 6. Frontend architecture

| Piece | Responsibility |
|-------|----------------|
| `hooks/useModels.ts` | React Query list + create/update/delete mutations; invalidate on success |
| `components/settings/ModelCatalog.jsx` (or `.tsx`) | Table + form; receives nothing critical from parent beyond optional callbacks |
| `pages/Settings.jsx` | Compose catalog; derive select options from `useModels` + remote state; remove `modelOptions` |
| `types/api.ts` | Tighten `ModelRecord` to catalog fields |
| `services/api.ts` | Already has `modelsAPI`; ensure create/update payloads use camelCase keys API expects |

**Shared helper (optional):** `catalogToSelectOptions(models, provider)` in a small util next to Settings — only if Chat also needs it later; YAGNI otherwise keep local in Settings.

## 7. Behavior edge cases

1. Delete own model that is currently selected as `default_model` → locally set model to first remaining option for provider; persist on «Зберегти».
2. Failed mutation → toast with API error; list unchanged until invalidate/refetch.
3. Loading: spinner for catalog fetch; Settings save path unchanged (`useUpdateSettings`).

## 8. Testing

- Vitest + RTL: `ModelCatalog` — renders system row without delete; own row shows delete; optional submit calls create mock.
- No new backend suite unless validation is added.

## 9. Rollout / acceptance

- [ ] Hardcoded `modelOptions` removed from Settings
- [ ] User can add/edit/delete own catalog entries
- [ ] System entries visible, not editable
- [ ] Default model select populated from catalog (and remote Ollama override)
- [ ] Frontend tests + lint green

## 10. Follow-ups (not this track)

- Wire Chat model selector to the same catalog
- «Save remote model to catalog» one-click
- Stricter Zod validation on POST/PUT `/models`

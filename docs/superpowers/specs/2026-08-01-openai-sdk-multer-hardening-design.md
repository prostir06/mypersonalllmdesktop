# OpenAI SDK Hardening + Multer Filename Fix

## Overview

Replace axios-based `openaiService.ts` with the official OpenAI SDK (restoring WIP capabilities: tools + streaming) while applying Bugbot hardening: tools opt-in, safe calculator, generic errors, safe options spread. Fix `decodeMulterFilename` so Western European accents (é, ü, ñ) are not corrupted.

## Goals

- `openaiService.ts` uses `openai` package (`chat.completions.create`)
- Tools on send **only if** `options.enableTools === true`; stream never attaches tools
- `executeTool('calculate')`: allowlist math characters; reject `**` and `^`; no unbounded exponentiation
- Thrown errors stay generic (no raw SDK `error.message` in Error string)
- Build completion payload so client `...options` cannot overwrite `tools` / `tool_choice` / `stream`
- Strip non-API fields: `enableTools`, `ollama_host`, `image` (and similar) before SDK call
- Fix `multerFilename.js` decoding heuristic; extend unit tests (`café.pdf`, existing Cyrillic cases)
- Update `openaiService.test.ts` for SDK mocks; keep ProviderFactory/Chat contracts unchanged

## Out of Scope

- Changing Ollama or ProviderFactory public API
- Frontend changes
- Enabling tools by default on `/chat/send`
- Multi-round tool loops beyond one follow-up completion
- Porting `multerFilename` to TypeScript (optional; stay JS unless needed for types)

## Architecture

```
ChatService / chatController (enableTools: false on stream)
  → ProviderFactory
       → openaiService.ts (OpenAI SDK)
documentsController
  → multerFilename.js decodeMulterFilename
```

| Action | Path |
|--------|------|
| Replace impl | `backend/src/services/openaiService.ts` |
| Modify | `backend/src/utils/multerFilename.js` |
| Update tests | `backend/src/__tests__/openaiService.test.ts` |
| Update/create | `backend/tests/utils/multerFilename.test.js` (or move under `src/__tests__` if preferred — keep existing path unless broken) |
| Keep | `providerFactory.ts`, `ollamaService.ts`, ChatService signatures |

## API Contract

### sendOpenAIMessage(messages, model?, options?)

- Returns `{ content, usage?, model }` (same shape as today).
- If `enableTools === true`: first completion may include `tools` + `tool_choice: 'auto'`; on `tool_calls`, run each via `executeTool`, append tool messages, second completion without tools; return second content.
- If tools disabled: no `tools` / `tool_choice` on the request.
- Options passed to SDK: temperature/max_tokens defaults (0.7 / 2000) then safe whitelist fields only — **never** spread unchecked options after tools config.

### streamOpenAIMessage(messages, model?, options?, onChunk?)

- `stream: true`; no tools.
- Async-iterate SDK stream; call `onChunk(token)` for each delta content; return `{ content, model }`.
- Callback errors: log and continue (do not abort whole stream for consumer throw).

### executeTool(name, args) — exported for tests

- `calculate`: sanitize to `[0-9+\-*/(). ]` only; if empty or contains `**` before/after sanitize → error string; evaluate with `Function` only on sanitized expression without `**`.
- `get_current_time`: `toLocaleString('uk-UA')`.
- Unknown tool: `"Unknown tool: …"`.

### decodeMulterFilename(name)

- `null`/`''` unchanged.
- If string has code points **> 255** → already real Unicode → return as-is (Cyrillic etc.).
- If all code points ≤ 255: attempt latin1→utf8 recovery **only when** result is a plausible fix (e.g. mojibake pattern / recovered string contains multi-byte UTF-8 usefulness). Prefer: try decode; if decoded equals input or is invalid, keep input; if input looks like correct Latin-1 Supplement text that is already UTF-16 code units for é (U+00E9), **do not** re-decode.
- Concrete rule (implementation):
  1. If any `charCodeAt > 255` → return name.
  2. Else compute `recovered = Buffer.from(name, 'latin1').toString('utf8')`.
  3. If `recovered` is valid UTF-8 round-trip improvement (contains characters with code > 255 **or** differs and `Buffer.from(recovered,'utf8').toString('latin1') === name`) → return `recovered`.
  4. Else return `name` (protects `café.pdf` already correct in JS string).

## Error Handling

- SDK/network failures → log via `logger`; throw `Failed to communicate with OpenAI API` / `Failed to stream from OpenAI API` without interpolating upstream message.
- Tool execution failures → return error string to model as tool content; do not crash send.

## Testing

1. send without `enableTools` → `create` not called with `tools`.
2. send with `enableTools: true` + mocked tool_calls → second create; each tool message present.
3. `executeTool('calculate', { expression: '2**1024' })` does not hang; returns error / safe rejection.
4. send failure → generic Error message.
5. stream emits tokens via onChunk.
6. multer: `звіт.pdf` unchanged; mojibake recovers; `café.pdf` / `señor.txt` unchanged when already correct Unicode.

No live OpenAI calls in unit tests.

## Implementation Order

1. Failing tests for multer accents + openai SDK behaviors
2. Fix `multerFilename.js`
3. Implement hardened `openaiService.ts` (SDK)
4. Green jest + `tsc --noEmit`

## Done Criteria

- [ ] Axios chat path removed from `openaiService.ts`
- [ ] Tools opt-in only; stream without tools
- [ ] Calculator cannot evaluate `**`
- [ ] Generic error throws; options cannot clobber tools
- [ ] Accent filenames not corrupted; Cyrillic mojibake still fixed
- [ ] Tests pass; typecheck passes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking axios-era openai tests | Rewrite tests to mock `openai` package |
| Over-aggressive multer heuristic | Round-trip check + explicit accent cases in tests |
| Chat still passes junk options | Strip known non-API keys; whitelist temperature/max_tokens/top_p |

## Approach Rationale

Chosen: **single slice SDK OpenAI + multer harden**, tools **opt-in**. Rejected splitting into two PRs and shipping SDK without tools.

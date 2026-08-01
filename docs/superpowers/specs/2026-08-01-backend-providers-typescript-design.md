# LLM Providers — TypeScript Migration (Pattern A)

## Overview

Migrate `openaiService`, `ollamaService`, and `providerFactory` from CommonJS JavaScript to TypeScript following Pattern A (1:1 behavioral port). Base the OpenAI implementation on **git HEAD** (axios chat completions), not the uncommitted OpenAI SDK WIP. Preserve ProviderFactory aliases and ChatService call sites.

## Goals

- Discard working-tree WIP: `git checkout -- backend/src/services/openaiService.js` before implementing
- Create `openaiService.ts`, `ollamaService.ts`, `providerFactory.ts` with `export =` / named exports matching current consumers
- Delete corresponding `.js` files after TS ports are green
- Port `providerFactory.test.js` → `.ts`; add unit tests for openai/ollama with mocked axios
- Keep HTTP/LLM request/response parity with HEAD (send + stream SSE parse)
- No Chat/Embedding/frontend changes; no Prisma schema work

## Out of Scope

- Official OpenAI SDK adoption
- Tool calling / `executeTool` / vision-specific SDK paths from WIP
- Hardening Bugbot findings that only exist in WIP (`**` in calculate, tools always-on, etc.)
- Changing provider alias map or ChatService options plumbing beyond type compatibility
- ESM / `"type": "module"`

## Architecture

```
ChatService.ts
  └─ ProviderFactory.ts
       ├─ openaiService.ts  → POST https://api.openai.com/v1/chat/completions
       └─ ollamaService.ts  → POST OLLAMA_API_URL | options.ollama_host
```

| Action | Path |
|--------|------|
| Create | `backend/src/services/openaiService.ts` |
| Create | `backend/src/services/ollamaService.ts` |
| Create | `backend/src/services/providerFactory.ts` |
| Create | `backend/src/__tests__/providerFactory.test.ts` |
| Create | `backend/src/__tests__/openaiService.test.ts` |
| Create | `backend/src/__tests__/ollamaService.test.ts` |
| Delete | matching `.js` sources and `providerFactory.test.js` |
| Keep | ChatService `import ProviderFactory = require('./providerFactory')` |

## API Contract

### openaiService / ollamaService

- `send*(messages, model?, options?)` → `{ content, usage?, model }`
- `stream*(messages, model?, options?, onChunk?)` → `{ content, model }`; invoke `onChunk(token)` per delta
- Strip `ollama_host` from options before spreading into JSON payload
- Defaults (HEAD): `temperature` 0.7, `max_tokens` 2000, `top_p` 1; OpenAI default model `gpt-3.5-turbo`; Ollama default `llama2`
- OpenAI auth: `Authorization: Bearer ${process.env.OPENAI_API_KEY}`
- Ollama default URL: `process.env.OLLAMA_API_URL` or `http://127.0.0.1:11434/v1/chat/completions`
- Stream: `responseType: 'stream'`, line-buffer SSE `data:` JSON, skip `[DONE]`, ignore partial JSON parse errors

### ProviderFactory

- Aliases → OpenAI handlers: `openai`, `chatgpt`, `gpt`, `microsoft`, `copilot`, `google`
- `ollama` → Ollama handlers
- Unknown name → OpenAI fallback
- `sendMessage(provider, messages, model, options?)`
- `streamMessage(provider, messages, model, options?, onChunk?)`
- `getAvailableProviders()` → `Object.keys(providers)`
- Log via `logger` on send/stream (parity with current factory)

## Error Handling

- Catch axios/network failures; log with `console.error` **or** project `logger` if swapping does not change thrown messages
- Re-throw generic errors only:
  - `Failed to communicate with OpenAI API` / `Failed to stream from OpenAI API`
  - `Failed to communicate with Ollama API` / `Failed to stream from Ollama API`
- Do not embed raw upstream `error.message` into thrown Error strings (HEAD behavior)
- ProviderFactory catches, logs, rethrows the same error

## Testing

Mock axios (and logger if used). Cover:

1. ProviderFactory: getProvider aliases/unknown, sendMessage/streamMessage wiring, getAvailableProviders
2. openai send: builds payload, success shape; failure → generic Error
3. openai stream: emits tokens via onChunk; resolves full content
4. ollama send/stream: uses `ollama_host` when provided; same error/stream expectations

No live OpenAI/Ollama in unit tests.

## Implementation Order

1. Discard WIP openaiService.js to match HEAD
2. Failing/ported tests for factory + openai + ollama
3. Implement three `.ts` services; delete `.js`
4. Green jest + `tsc --noEmit`; smoke optional against running providers

## Done Criteria

- [ ] WIP discarded; HEAD axios OpenAI behavior in TS
- [ ] All three modules TypeScript; JS deleted
- [ ] Factory aliases and ChatService require path unchanged in behavior
- [ ] Unit tests pass; typecheck passes
- [ ] No SDK/tools; no frontend/schema changes

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Accidentally porting WIP SDK file | Explicit checkout to HEAD first; compare to `git show HEAD:...` |
| Stream buffer regressions | Port SSE loop verbatim; focused stream unit test with mock readable |
| Module resolution `.js` vs `.ts` | Delete JS after TS exists; `export =` / named exports match requires |
| ChatService import breakage | Keep `ProviderFactory` default/export shape compatible with `import = require` |

## Approach Rationale

Chosen: **Pattern A 1:1 TS port of HEAD** (axios + factory), all three files in one slice, discard WIP. Rejected shared types-heavy refactor and SDK migration in-slice (user selected clean HEAD port).

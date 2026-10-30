# Wave 4: Full Anthropic Claude Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Anthropic Claude as a fully supported first-class LLM provider with official `@anthropic-ai/sdk`, streaming completions, usage telemetry & cost estimation, multimodal vision, AES-256-GCM encrypted key storage, and frontend management.

**Architecture:**
- **Secure Encrypted Key Storage**: Add `anthropicApiKeyEnc` to Prisma `UserSettings`. Encrypt keys using AES-256-GCM (`encryptSecret`), decrypt via `claudeKeyResolver.ts` with fallback to `ANTHROPIC_API_KEY` env var. Expose only `has_anthropic_api_key: boolean` to the frontend.
- **Provider Adapter**: Implement `claudeService.ts` using official `@anthropic-ai/sdk`. Implement streaming via `client.messages.stream(...)`, parsing text deltas and usage events, calculating costs with `tokenCostCalculator.ts`, mapping base64 image attachments to Claude vision blocks, and handling abort signals.
- **Catalog & Factory**: Register `'anthropic'` in `providerFactory.ts`, add default Claude models (`claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`, `claude-3-opus-20240229`) in `modelsService.ts`, and mark vision capabilities in `modelCapabilities.ts`.
- **Frontend Management**: Create `ClaudeSettingsCard.tsx` in `ApiKeysTab.tsx` with key validation (`sk-ant-...`), save, and clear actions. Update `ChatControls.jsx` and model selector.

**Tech Stack:** `@anthropic-ai/sdk`, Express, Prisma ORM, PostgreSQL, React 18, React-Bootstrap, TypeScript, Vitest, Jest.

## Global Constraints
- Node >= 20.18.0, npm >= 10.8.2.
- Zero raw API key leakage (`sk-ant-...`) in git, logs, or unencrypted database columns.
- Streaming error handling must fail gracefully without hanging connections.
- 100% passing tests across backend (Jest), frontend (Vitest), desktop (Node test runner), and CI audit checks.

---

### Task 1: Encrypted Key Storage & Settings API for Claude

**Files:**
- Modify: `backend/prisma/schema.prisma:30-48`
- Create: `backend/prisma/migrations/20261030190000_add_anthropic_api_key_enc/migration.sql`
- Create: `backend/src/utils/claudeKeyResolver.ts`
- Create: `backend/src/__tests__/claudeKeyResolver.test.ts`
- Modify: `backend/src/services/settingsService.ts`
- Modify: `backend/src/__tests__/settingsService.test.ts`
- Modify: `backend/src/services/chat/prepare.ts:130-150`
- Modify: `backend/src/__tests__/chatHttpHelpers.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`, `decryptSecret`, Prisma ORM.
- Produces: `resolveClaudeApiKey(userId: number): Promise<string | null>`, `has_anthropic_api_key: boolean` in settings DTO.

- [ ] **Step 1: Write failing tests for claudeKeyResolver and settingsService**

Create `backend/src/__tests__/claudeKeyResolver.test.ts`:
Test cases:
1. `envClaudeKey` returns trimmed `process.env.ANTHROPIC_API_KEY` or null if placeholder or missing.
2. `resolveClaudeApiKey` returns decrypted key when `anthropicApiKeyEnc` exists in DB.
3. `resolveClaudeApiKey` falls back to environment variable when DB column is null.
4. `resolveClaudeApiKey` logs warning and falls back to env on decryption error.

In `backend/src/__tests__/settingsService.test.ts`:
Add tests:
1. `toPublicSettingsAsync` includes `has_anthropic_api_key: true` when `anthropicApiKeyEnc` is present.
2. `updateSettingsForUser` encrypts `anthropic_api_key` and saves to `anthropicApiKeyEnc`.
3. `updateSettingsForUser` clears `anthropicApiKeyEnc` when `clear_anthropic_api_key: true`.
4. Rejects placeholder `your_anthropic_api_key_here`.

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeKeyResolver.test.ts"`
Expected: Test fails.

- [ ] **Step 2: Update Prisma schema and create migration**

In `backend/prisma/schema.prisma`:
Add `anthropicApiKeyEnc String? @map("anthropic_api_key_enc") @db.Text` to `model UserSettings`.

Create `backend/prisma/migrations/20261030190000_add_anthropic_api_key_enc/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN "anthropic_api_key_enc" TEXT;
```
Run `npx prisma generate --schema=backend/prisma/schema.prisma`.

- [ ] **Step 3: Implement claudeKeyResolver.ts and update settingsService.ts**

Create `backend/src/utils/claudeKeyResolver.ts`:
- Define `PLACEHOLDER = 'your_anthropic_api_key_here'`.
- `envClaudeKey()`: reads and trims `process.env.ANTHROPIC_API_KEY`.
- `resolveClaudeApiKey(userId: number)`: queries `userSettings.anthropicApiKeyEnc`, decrypts via `decryptSecret`, falls back to `envClaudeKey()`.

In `backend/src/services/settingsService.ts`:
- Update `UserSettingsInput`: add `anthropic_api_key?: string; clear_anthropic_api_key?: boolean;`.
- Update `defaultSettings`: add `has_anthropic_api_key: false`.
- Update `toPublicSettings` and `toPublicSettingsAsync`: add `has_anthropic_api_key: Boolean(row.anthropicApiKeyEnc)`.
- Update `updateSettingsForUser`:
  - Handle `clear_anthropic_api_key: true` -> `data.anthropicApiKeyEnc = null`.
  - Handle `anthropic_api_key` -> validate, reject placeholder, encrypt with `encryptSecret(trimmed, userId)`, set `data.anthropicApiKeyEnc`.

In `backend/src/services/chat/prepare.ts`:
- Import `resolveClaudeApiKey`.
- Add condition:
  ```typescript
  if (input.provider === 'gemini') {
    const geminiKey = await resolveGeminiApiKey(input.userId);
    if (geminiKey) options.apiKey = geminiKey;
  } else if (input.provider === 'anthropic') {
    const claudeKey = await resolveClaudeApiKey(input.userId);
    if (claudeKey) options.apiKey = claudeKey;
  } else {
    const openaiKey = await resolveOpenAiApiKey(input.userId);
    if (openaiKey) options.apiKey = openaiKey;
  }
  ```

- [ ] **Step 4: Run unit tests and verify pass**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeKeyResolver.test.ts" "backend/src/__tests__/settingsService.test.ts"`
Expected: All tests pass.

- [ ] **Step 5: Run backend lint and typecheck**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Expected: 0 errors.

- [ ] **Step 6: Commit changes**

Commit: `feat(be): add anthropic_api_key_enc column and claude key resolution`

---

### Task 2: Backend Claude Service (`claudeService.ts`) & Provider Factory

**Files:**
- Create: `backend/src/services/claudeService.ts`
- Create: `backend/src/__tests__/claudeService.test.ts`
- Modify: `backend/src/services/providerFactory.ts`
- Modify: `backend/src/utils/modelCapabilities.ts`
- Modify: `backend/src/services/modelsService.ts`
- Modify: `backend/src/__tests__/modelsService.test.ts`

**Interfaces:**
- Consumes: `@anthropic-ai/sdk`, `calculateTokenCost`, `TokenUsage`.
- Produces: `sendClaudeMessage`, `streamClaudeMessage`, `'anthropic'` provider registration in `ProviderFactory`.

- [ ] **Step 1: Write failing unit tests for claudeService**

Create `backend/src/__tests__/claudeService.test.ts`:
Test cases:
1. `sendClaudeMessage` calls `client.messages.create`, returns content and tokenUsage with calculated cost.
2. `streamClaudeMessage` streams text chunks via `onChunk` and returns final content and tokenUsage.
3. Formats base64 images into Claude image content blocks (`image/jpeg`, `image/png`, etc.).
4. Propagates `options.signal` abort to Anthropic stream controller.
5. Maps Anthropic API errors (401 invalid key, 429 rate limit, 529 overloaded) to localized user-friendly errors.

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeService.test.ts"`
Expected: Tests fail (service does not exist).

- [ ] **Step 2: Implement claudeService.ts**

Create `backend/src/services/claudeService.ts`:
- Import `Anthropic` from `@anthropic-ai/sdk`.
- `formatClaudeMessages`:
  - Separates system instructions into top-level `system` prompt parameter.
  - Formats user and assistant turns: converts user string or multimodal attachments (images) into `Anthropic.MessageParam` with text and image content blocks.
- `sendClaudeMessage`:
  - Instantiates client with `apiKey: options?.apiKey || process.env.ANTHROPIC_API_KEY`.
  - Calls `client.messages.create`.
  - Extracts text from content blocks and usage (`input_tokens`, `output_tokens`).
  - Calls `calculateTokenCost` and returns `{ content, tokenUsage, model }`.
- `streamClaudeMessage`:
  - Calls `client.messages.stream({ model, max_tokens, messages, system })`.
  - Listens to `text` events and invokes `onChunk(token)`.
  - Captures `finalMessage()` usage metadata and calculates cost.
  - Binds `options.signal?.addEventListener('abort', () => stream.controller.abort())`.
  - Handles errors gracefully, returning clean messages.

- [ ] **Step 3: Register in ProviderFactory, ModelCapabilities, and ModelsService**

In `backend/src/services/providerFactory.ts`:
- Import `claudeService`.
- Register:
  ```typescript
  anthropic: {
    send: claudeService.sendClaudeMessage as SendFn,
    stream: claudeService.streamClaudeMessage as StreamFn,
  },
  ```

In `backend/src/utils/modelCapabilities.ts`:
- In `modelSupportsVision`:
  Add check for `m.startsWith('claude-3') || m.includes('claude-3')` -> returns `true`.

In `backend/src/services/modelsService.ts`:
- Define `DEFAULT_CLAUDE_MODELS`:
  - `Claude 3.5 Sonnet` (`claude-3-5-sonnet-20241022`, provider: `'anthropic'`, maxTokens: 4096, temperature: 0.7)
  - `Claude 3.5 Haiku` (`claude-3-5-haiku-20241022`, provider: `'anthropic'`, maxTokens: 4096, temperature: 0.7)
- Add `DEFAULT_CLAUDE_MODELS` to `DEFAULT_MODELS`.

- [ ] **Step 4: Run unit tests and verify pass**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeService.test.ts" "backend/src/__tests__/openaiService.test.ts" "backend/src/__tests__/geminiService.test.ts"`
Expected: All tests pass.

- [ ] **Step 5: Run backend lint and typecheck**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Expected: 0 errors.

- [ ] **Step 6: Commit changes**

Commit: `feat(be): implement claudeService with streaming, vision and provider factory registration`

---

### Task 3: Frontend API & Settings UI (`ClaudeSettingsCard.tsx`)

**Files:**
- Modify: `frontend/src/types/api.ts:260-285`
- Create: `frontend/src/components/settings/ClaudeSettingsCard.tsx`
- Create: `frontend/src/components/settings/ClaudeSettingsCard.test.tsx`
- Modify: `frontend/src/components/settings/ApiKeysTab.tsx`
- Modify: `frontend/src/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `UserSettings.has_anthropic_api_key`, `onSaveClaudeKey`, `onClearClaudeKey`.
- Produces: `ClaudeSettingsCard` component, integrated into `ApiKeysTab`.

- [ ] **Step 1: Write failing unit tests for ClaudeSettingsCard**

Create `frontend/src/components/settings/ClaudeSettingsCard.test.tsx`:
Test cases:
1. Renders card with status "Не налаштовано" when `has_anthropic_api_key` is false.
2. Renders status "Збережено" when `has_anthropic_api_key` is true.
3. Validates key input: warns if key does not start with `sk-ant-`.
4. Calls `onSaveClaudeKey` when saving valid key.
5. Calls `onClearClaudeKey` when clearing key.

Run: `npm test --prefix frontend -- src/components/settings/ClaudeSettingsCard.test.tsx`
Expected: Test fails (component does not exist).

- [ ] **Step 2: Update frontend types and implement ClaudeSettingsCard.tsx**

In `frontend/src/types/api.ts`:
- Add `has_anthropic_api_key?: boolean;` to `UserSettings`.
- Add `anthropic_api_key?: string; clear_anthropic_api_key?: boolean;` to `SettingsUpdatePayload`.

Create `frontend/src/components/settings/ClaudeSettingsCard.tsx`:
- Props:
  ```typescript
  export interface ClaudeSettingsCardProps {
    hasKey?: boolean;
    onSaveKey: (key: string) => Promise<void>;
    onClearKey: () => Promise<void>;
    isSaving?: boolean;
  }
  ```
- Form input for API key with password visibility toggle.
- Save and Clear buttons with loading indicators.
- Helper link to console.anthropic.com.

In `frontend/src/components/settings/ApiKeysTab.tsx`:
- Import `ClaudeSettingsCard`.
- Render `ClaudeSettingsCard` alongside OpenAI and Gemini cards.
- Wire `handleSaveClaudeKey` and `handleClearClaudeKey` via `useUpdateSettings()`.

- [ ] **Step 3: Run unit tests and verify pass**

Run: `npm test --prefix frontend -- src/components/settings/ClaudeSettingsCard.test.tsx src/pages/Settings.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Run frontend lint and typecheck**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Expected: 0 errors.

- [ ] **Step 5: Commit changes**

Commit: `feat(fe): build ClaudeSettingsCard and integrate into ApiKeysTab`

---

### Task 4: Frontend Chat Controls & Multimodal Claude Selection

**Files:**
- Modify: `frontend/src/components/chat/ChatControls.jsx` (or `.tsx`)
- Modify: `frontend/src/utils/modelSupportsVision.ts`
- Modify: `frontend/src/utils/modelSupportsVision.test.ts`
- Modify: `frontend/src/components/ChatBoxOptimized.test.tsx`

**Interfaces:**
- Consumes: Catalog models with provider `'anthropic'`, `supports_vision` flag.
- Produces: Claude provider/model selection and image attachment enablement.

- [ ] **Step 1: Write failing unit tests for Claude model selection and vision**

In `frontend/src/utils/modelSupportsVision.test.ts`:
- Add tests verifying `claude-3-5-sonnet-20241022` and `claude-3-5-haiku-20241022` return `supports_vision: true`.

Run: `npm test --prefix frontend -- src/utils/modelSupportsVision.test.ts`
Expected: Tests fail if not supported.

- [ ] **Step 2: Update modelSupportsVision and ChatControls**

In `frontend/src/utils/modelSupportsVision.ts`:
- In addition to checking catalog `supports_vision`, support Claude 3/3.5 models fallback:
  `if (m.startsWith('claude-3') || m.includes('claude-3')) return true;`.

In `frontend/src/components/chat/ChatControls.jsx`:
- Ensure `'anthropic'` is included in provider badge/options if provider filtering is enabled.

- [ ] **Step 3: Run unit tests and verify pass**

Run: `npm test --prefix frontend -- src/utils/modelSupportsVision.test.ts src/components/ChatBoxOptimized.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Run full frontend test suite, lint, and build**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Run: `npm test --prefix frontend`
Run: `npm run build --prefix frontend`
Expected: 0 errors, all test files pass, build succeeds.

- [ ] **Step 5: Commit changes**

Commit: `feat(fe): support Anthropic Claude provider in ChatControls and vision attachment`

---

### Task 5: Wave 4 Final Quality Gate & Whole-Wave Review

**Files:**
- Entire workspace

**Interfaces:**
- Consumes: All Wave 4 code, migrations, and dependencies.
- Produces: Fully verified Wave 4 branch approved by senior whole-branch review.

- [ ] **Step 1: Backend verification**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Run: `npm run audit:ci --prefix backend`
Run: `npm test --prefix backend`
Expected: 0 errors, 0 audit warnings, 100% test pass.

- [ ] **Step 2: Frontend verification**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Run: `npm test --prefix frontend`
Run: `npm run build --prefix frontend`
Expected: 0 errors, all test files pass.

- [ ] **Step 3: Desktop verification**

Run: `npm test --prefix desktop`
Expected: 24/24 tests pass.

- [ ] **Step 4: Verify git status is clean**

Run: `git status`
Expected: working tree clean.

- [ ] **Step 5: Senior Whole-Wave Code Review**

Generate diff package: `git diff -U10 d0c327d..HEAD > .superpowers/sdd/2026-10-30-v16-w4-anthropic-claude/review-whole-wave-4.diff`.
Dispatch senior code reviewer subagent.
Address any review findings if needed until `APPROVED`.

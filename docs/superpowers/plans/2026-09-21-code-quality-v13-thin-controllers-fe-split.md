# Code Quality v13 — Thin Controllers + FE Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all listed BE controllers to ≤180 physical LOC and all listed FE production files to ≤300 physical LOC via surgical extract, with zero API/UX/behavior changes.

**Architecture:** Controllers become HTTP adapters over services/utils. FE thick files split along existing seams (presets, list/form subcomponents, hooks, stream helpers). One PR; atomic commits per task.

**Tech Stack:** Express + Prisma (BE Jest), React + Vite (FE Vitest), TypeScript.

**Spec:** `docs/superpowers/specs/2026-09-21-code-quality-v13-thin-controllers-fe-split-design.md`

## Global Constraints

- No behavior, route, status-code, JSON key, or SSE frame changes.
- Production must not leak internal error details (same as today).
- Physical line count gate: BE target files ≤180; FE target files ≤300. Measure with PowerShell: `(Get-Content <path>).Count`.
- Do not commit unrelated dirty files (`README.md`, `2026-08-01-openai-sdk-multer-hardening-design.md`).
- No ESLint `max-lines` hard-fail in this wave.
- Prefer move-then-import; no pointless one-line re-export wrappers for LOC games.

### File map (create / modify)

| Path | Role |
|------|------|
| `backend/src/services/settingsService.ts` | **Create** — defaults, public/row mappers, get/update domain |
| `backend/src/controllers/settingsController.ts` | Thin GET/PUT only |
| `backend/src/services/documents/httpErrors.ts` | **Create** — id parse + upload/reindex/retry error mapping |
| `backend/src/controllers/documentsController.ts` | Thin handlers using helpers |
| `backend/src/utils/sse.ts` | **Create** — `writeSse` |
| `backend/src/services/chat/httpHelpers.ts` | **Create** — chat validate + public errors + `isChatError` |
| `backend/src/controllers/chatController.ts` | Thin adapters over ChatService |
| `frontend/src/components/promptLibrary/promptPresets.ts` | **Create** — `PRESET_PROMPTS` |
| `frontend/src/components/promptLibrary/PromptPresetsTab.tsx` | **Create** |
| `frontend/src/components/promptLibrary/PromptMineTab.tsx` | **Create** |
| `frontend/src/components/PromptLibraryModal.tsx` | Shell ≤300 |
| `frontend/src/components/chat/documentModal/RagModeBadge.tsx` | **Create** |
| `frontend/src/components/chat/documentModal/fileKindLabel.ts` | **Create** |
| `frontend/src/components/chat/documentModal/ChunkPreview.tsx` | **Create** |
| `frontend/src/components/chat/documentModal/DocumentListItem.tsx` | **Create** — list row UI |
| `frontend/src/components/chat/DocumentModal.tsx` | Shell ≤300 |
| `frontend/src/hooks/useModelCatalog.ts` | **Create** — form/CRUD state |
| `frontend/src/components/settings/ModelCatalogTable.tsx` | **Create** |
| `frontend/src/components/settings/ModelCatalogForm.tsx` | **Create** |
| `frontend/src/components/settings/ModelCatalog.tsx` | Compose ≤300 |
| `frontend/src/pages/dashboard/DashboardSidebar.tsx` | **Create** |
| `frontend/src/pages/dashboard/NewConversationModal.tsx` | **Create** |
| `frontend/src/pages/Dashboard.tsx` | Orchestration ≤300 |
| `frontend/src/components/chat/ChatHiddenFileInputs.tsx` | **Create** — hidden file inputs |
| `frontend/src/components/ChatBoxOptimized.tsx` | Orchestration ≤300 |
| `frontend/src/hooks/chatStreamHelpers.ts` | **Create** — rAF batch + applyAssistantMessage helpers |
| `frontend/src/hooks/useChatStream.ts` | Orchestration ≤300 |

---

### Task 1: Settings — `settingsService` + thin controller

**Files:**
- Create: `backend/src/services/settingsService.ts`
- Modify: `backend/src/controllers/settingsController.ts`
- Test: `backend/src/__tests__/settings.test.ts` (existing; no API change)

**Interfaces:**
- Produces:
  - `defaultSettings(): PublicSettings`
  - `toPublicSettingsAsync(row): Promise<PublicSettings>`
  - `toSettingsRow(row): SettingsRow`
  - `getSettingsForUser(userId: number | undefined): Promise<PublicSettings>`
  - `updateSettingsForUser(userId: number, body: UpdateSettingsBody): Promise<SettingsRow>`
  - Throws / returns via Result: keep `EncryptionConfigError` path → controller maps to 503; placeholder key → controller maps to 400

- [ ] **Step 1: Add focused unit test for defaults + public mapper shape**

Create `backend/src/__tests__/settingsService.test.ts`:

```typescript
jest.mock('../services/embeddings/resolveEmbeddingContext', () => ({
  resolveEmbeddingContext: jest.fn().mockResolvedValue({ provider: 'none' }),
  invalidateEmbeddingContextCache: jest.fn(),
}));

import {
  defaultSettings,
  toPublicSettingsAsync,
  toSettingsRow,
} from '../services/settingsService';

describe('settingsService mappers', () => {
  it('defaultSettings returns snake_case public shape', () => {
    const d = defaultSettings();
    expect(d).toMatchObject({
      default_model: 'gpt-3.5-turbo',
      temperature: 0.7,
      max_tokens: 2000,
      default_provider: 'openai',
      system_prompt: '',
      has_openai_api_key: false,
      rag_embedding_mode: 'fallback',
    });
    expect(d).toHaveProperty('default_ollama_host');
  });

  it('toSettingsRow never exposes key material', async () => {
    const row = toSettingsRow({
      id: 1,
      userId: 9,
      defaultModel: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1500,
      defaultProvider: 'openai',
      defaultOllamaHost: null,
      systemPrompt: 'hi',
      openaiApiKeyEnc: 'enc-blob',
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
    });
    expect(row.has_openai_api_key).toBe(true);
    expect(row).not.toHaveProperty('openaiApiKeyEnc');
    expect(row).not.toHaveProperty('openai_api_key');
  });

  it('toPublicSettingsAsync sets has_openai_api_key from enc', async () => {
    const pub = await toPublicSettingsAsync({
      defaultModel: 'gpt-4o',
      temperature: 0.5,
      maxTokens: 1500,
      defaultProvider: 'openai',
      defaultOllamaHost: null,
      systemPrompt: '',
      openaiApiKeyEnc: 'x',
      userId: 9,
    });
    expect(pub.has_openai_api_key).toBe(true);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `cd backend && npx jest src/__tests__/settingsService.test.ts -v`  
Expected: FAIL — cannot find `settingsService`

- [ ] **Step 3: Move logic into `settingsService.ts`**

Move from `settingsController.ts` verbatim: `FALLBACK_OLLAMA`, `KEY_PLACEHOLDER`, `defaultSettings`, `hasEncKey`, `toPublicSettingsAsync`, `toSettingsRow`, plus Prisma get/update bodies into:

```typescript
// backend/src/services/settingsService.ts
import prisma from '../config/prisma';
import logger from '../logger';
import { encryptSecret, EncryptionConfigError } from '../utils/secretCrypto';
import { embeddingContextToRagMode } from './embeddings/types';
import {
  resolveEmbeddingContext,
  invalidateEmbeddingContextCache,
} from './embeddings/resolveEmbeddingContext';
import { numTemp } from '../utils/numTemp';

export const KEY_PLACEHOLDER = 'your_openai_api_key_here';

export type UpdateSettingsBody = {
  default_model?: string;
  temperature?: number;
  max_tokens?: number;
  default_provider?: string;
  default_ollama_host?: string;
  system_prompt?: string;
  openai_api_key?: string;
  clear_openai_api_key?: boolean;
};

export class InvalidOpenAiKeyError extends Error {
  constructor() {
    super('Invalid OpenAI API key');
    this.name = 'InvalidOpenAiKeyError';
  }
}

// ... move defaultSettings, hasEncKey, toPublicSettingsAsync, toSettingsRow unchanged ...

export async function getSettingsForUser(
  userId: number | undefined
): Promise<ReturnType<typeof defaultSettings>> {
  const defaults = defaultSettings();
  if (!userId) return defaults;
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return defaults;
    return toPublicSettingsAsync({ ...row, userId });
  } catch (dbError: unknown) {
    const message = dbError instanceof Error ? dbError.message : String(dbError);
    logger.warn(`Settings GET failed, falling back to defaults: ${message}`);
    return defaults;
  }
}

export async function updateSettingsForUser(
  userId: number,
  body: UpdateSettingsBody
) {
  // Move upsert + encrypt logic from controller; on KEY_PLACEHOLDER throw InvalidOpenAiKeyError;
  // let EncryptionConfigError propagate; call invalidateEmbeddingContextCache(userId) before upsert;
  // return toSettingsRow(row)
}
```

- [ ] **Step 4: Thin `settingsController.ts`**

```typescript
import { Response } from 'express';
import { jsonError } from '../utils/httpJson';
import { EncryptionConfigError } from '../utils/secretCrypto';
import logger from '../logger';
import type { AuthRequest } from '../types/express';
import {
  getSettingsForUser,
  updateSettingsForUser,
  InvalidOpenAiKeyError,
} from '../services/settingsService';

export async function getSettings(req: AuthRequest, res: Response): Promise<void> {
  try {
    res.json(await getSettingsForUser(req.userId));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in GET /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to fetch settings');
  }
}

export async function updateSettings(req: AuthRequest, res: Response): Promise<void> {
  if (!req.userId) {
    jsonError(res, req, 401, 'No token, authorization denied');
    return;
  }
  try {
    res.json(await updateSettingsForUser(req.userId, req.body));
  } catch (error: unknown) {
    if (error instanceof InvalidOpenAiKeyError) {
      jsonError(res, req, 400, error.message);
      return;
    }
    if (error instanceof EncryptionConfigError) {
      jsonError(res, req, 503, 'Помилка конфігурації шифрування');
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    logger.error(`Error in PUT /settings: ${message}`);
    jsonError(res, req, 500, 'Failed to update settings');
  }
}
```

Confirm `(Get-Content backend/src/controllers/settingsController.ts).Count -le 180`.

- [ ] **Step 5: Run tests**

Run: `cd backend && npx jest src/__tests__/settingsService.test.ts src/__tests__/settings.test.ts -v`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/settingsService.ts backend/src/controllers/settingsController.ts backend/src/__tests__/settingsService.test.ts
git commit -m "refactor(be): extract settingsService; thin settingsController"
```

---

### Task 2: Documents — HTTP helpers + thin controller

**Files:**
- Create: `backend/src/services/documents/httpErrors.ts`
- Create: `backend/src/__tests__/documentsHttpErrors.test.ts`
- Modify: `backend/src/controllers/documentsController.ts`
- Test: `backend/src/__tests__/documents.test.ts`

**Interfaces:**
- Produces:
  - `parseDocumentId(raw: string): number | null` — digits-only
  - `publicUploadError(isProd: boolean, publicError: string, details: string): string`
  - `reindexErrorStatus(error: unknown): 400 | 409 | 500` (+ message)
  - `retryErrorStatus(message: string): 409 | 500`

- [ ] **Step 1: Failing unit tests for helpers**

```typescript
import {
  parseDocumentId,
  publicUploadError,
  classifyReindexError,
  classifyRetryError,
} from '../services/documents/httpErrors';
import { UrlNotAllowedError } from '../utils/urlAllowlist';

describe('documents httpErrors', () => {
  it('parseDocumentId accepts digits only', () => {
    expect(parseDocumentId('42')).toBe(42);
    expect(parseDocumentId('x')).toBeNull();
  });

  it('publicUploadError hides details in production', () => {
    expect(publicUploadError(true, 'Публічна', 'secret')).toBe('Публічна');
    expect(publicUploadError(false, 'Публічна', 'secret')).toBe('Публічна: secret');
  });

  it('classifyReindexError maps UrlNotAllowed and known 409 phrases', () => {
    expect(classifyReindexError(new UrlNotAllowedError('bad')).status).toBe(400);
    expect(
      classifyReindexError(new Error('Немає фрагментів для переіндексації')).status
    ).toBe(409);
    expect(classifyReindexError(new Error('boom')).status).toBe(500);
  });

  it('classifyRetryError maps conflict phrase', () => {
    expect(classifyRetryError('ліміт повторної індексації').status).toBe(409);
    expect(classifyRetryError('other').status).toBe(500);
  });
});
```

Use the **exact** Ukrainian substrings currently in `documentsController.ts` for 409 matching (`провайдера embeddings`, `фрагментів для переіндексації`, `Не вдалося згенерувати embeddings`, `повторної індексації`).

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && npx jest src/__tests__/documentsHttpErrors.test.ts -v`

- [ ] **Step 3: Implement `httpErrors.ts` and slim controller**

Implement helpers; in controller replace repeated `/^\d+$/` blocks with:

```typescript
const id = parseDocumentId(String(req.params.id));
if (id == null) {
  jsonError(res, req, 400, 'Некоректний ідентифікатор документа');
  return;
}
```

Replace upload/reindex/retry catch bodies with `publicUploadError` / `classifyReindexError` / `classifyRetryError`.

Target: `(Get-Content backend/src/controllers/documentsController.ts).Count -le 180`.

If still >180 after helpers, also extract shared `UploadedFile` / `DocAuthRequest` types into `services/documents/types.ts` (only if needed).

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest src/__tests__/documentsHttpErrors.test.ts src/__tests__/documents.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/documents/httpErrors.ts backend/src/controllers/documentsController.ts backend/src/__tests__/documentsHttpErrors.test.ts
git commit -m "refactor(be): extract documents HTTP helpers; thin documentsController"
```

---

### Task 3: Chat — SSE/http helpers + thin controller

**Files:**
- Create: `backend/src/utils/sse.ts`
- Create: `backend/src/services/chat/httpHelpers.ts`
- Create: `backend/src/__tests__/chatHttpHelpers.test.ts`
- Modify: `backend/src/controllers/chatController.ts`
- Test: `backend/src/__tests__/chat.test.ts`

**Interfaces:**
- Produces:
  - `writeSse(res: Response, payload: unknown): void`
  - `isChatError(error: unknown): error is Error & { statusCode: number }`
  - `validateChatMessage(message, req, res): message is string`
  - `publicErrorJson(req, publicError, details)`
  - `publicStreamErrorText(details: string): string`

- [ ] **Step 1: Failing tests for pure helpers**

```typescript
import {
  isChatError,
  publicStreamErrorText,
  publicErrorJson,
} from '../services/chat/httpHelpers';

describe('chat httpHelpers', () => {
  const prev = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = prev;
  });

  it('isChatError detects statusCode', () => {
    expect(isChatError(Object.assign(new Error('x'), { statusCode: 403 }))).toBe(
      true
    );
    expect(isChatError(new Error('x'))).toBe(false);
  });

  it('publicStreamErrorText masks in production', () => {
    process.env.NODE_ENV = 'production';
    expect(publicStreamErrorText('secret')).toBe('Stream failed');
    process.env.NODE_ENV = 'test';
    expect(publicStreamErrorText('secret')).toBe('secret');
  });

  it('publicErrorJson omits details in production', () => {
    process.env.NODE_ENV = 'production';
    const body = publicErrorJson(
      { id: 'r1' } as any,
      'Failed',
      'secret'
    );
    expect(body).toEqual({ error: 'Failed', requestId: 'r1' });
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Move helpers; keep handler bodies behavior-identical**

`utils/sse.ts` — move `writeSse` as-is (keep logger.warn on write failure).

`services/chat/httpHelpers.ts` — move `isChatError`, `validateChatMessage`, `isProduction`, `publicErrorJson`, `publicStreamErrorText`.

`chatController.ts` imports helpers; `sendMessage` / `streamMessage` / `getHistory` / `searchMessages` logic unchanged aside from imports.

Confirm `(Get-Content backend/src/controllers/chatController.ts).Count -le 180`.

- [ ] **Step 4: Run tests**

Run: `cd backend && npx jest src/__tests__/chatHttpHelpers.test.ts src/__tests__/chat.test.ts -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/sse.ts backend/src/services/chat/httpHelpers.ts backend/src/controllers/chatController.ts backend/src/__tests__/chatHttpHelpers.test.ts
git commit -m "refactor(be): extract chat SSE/http helpers; thin chatController"
```

---

### Task 4: FE — PromptLibraryModal split

**Files:**
- Create: `frontend/src/components/promptLibrary/promptPresets.ts`
- Create: `frontend/src/components/promptLibrary/PromptPresetsTab.tsx`
- Create: `frontend/src/components/promptLibrary/PromptMineTab.tsx`
- Modify: `frontend/src/components/PromptLibraryModal.tsx`
- Test: `frontend/src/components/PromptLibraryModal.test.tsx`

**Interfaces:**
- Produces:
  - `export type PromptPreset = { id: string; icon: string; title: string; category: string; prompt: string }`
  - `export const PRESET_PROMPTS: PromptPreset[]`
  - `PromptPresetsTab({ onSelectPrompt, onHide })`
  - `PromptMineTab({ onSelectPrompt, onHide })` — owns load/create/pin/delete state

- [ ] **Step 1: Move `PRESET_PROMPTS` array unchanged into `promptPresets.ts`**

- [ ] **Step 2: Extract tabs**

`PromptPresetsTab.tsx` — presets grid JSX from modal (lines that map `PRESET_PROMPTS`).

`PromptMineTab.tsx` — form + list + `loadUserPrompts` / create / pin / delete handlers currently in modal.

`PromptLibraryModal.tsx` — Modal shell + Nav tabs + render active tab only.

- [ ] **Step 3: Confirm LOC + tests**

```powershell
(Get-Content frontend/src/components/PromptLibraryModal.tsx).Count  # ≤300
cd frontend; npm test -- PromptLibraryModal.test.tsx
```

Expected: PASS; public default export + props unchanged.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/promptLibrary frontend/src/components/PromptLibraryModal.tsx
git commit -m "refactor(fe): split PromptLibraryModal into presets/mine tabs"
```

---

### Task 5: FE — DocumentModal split

**Files:**
- Create: `frontend/src/components/chat/documentModal/RagModeBadge.tsx`
- Create: `frontend/src/components/chat/documentModal/fileKindLabel.ts`
- Create: `frontend/src/components/chat/documentModal/ChunkPreview.tsx`
- Create: `frontend/src/components/chat/documentModal/DocumentListItem.tsx`
- Modify: `frontend/src/components/chat/DocumentModal.tsx`

**Interfaces:**
- Keep `export type DocumentModalProps` and `export default DocumentModal` on `DocumentModal.tsx`.
- `DocumentListItem` receives one `doc` + action props already on the modal.

- [ ] **Step 1: Move `RagModeBadge`, `fileKindLabel`, `ChunkPreview` out unchanged**

- [ ] **Step 2: Move list-row JSX into `DocumentListItem.tsx`**

- [ ] **Step 3: Slim `DocumentModal` to header/upload/list map/footer**

```powershell
(Get-Content frontend/src/components/chat/DocumentModal.tsx).Count  # ≤300
cd frontend; npm test -- ChatBoxOptimized.test.tsx
```

(ChatBox mocks DocumentModal — ensures imports still resolve.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/chat/documentModal frontend/src/components/chat/DocumentModal.tsx
git commit -m "refactor(fe): split DocumentModal into documentModal/* parts"
```

---

### Task 6: FE — ModelCatalog split

**Files:**
- Create: `frontend/src/hooks/useModelCatalog.ts`
- Create: `frontend/src/components/settings/ModelCatalogTable.tsx`
- Create: `frontend/src/components/settings/ModelCatalogForm.tsx`
- Modify: `frontend/src/components/settings/ModelCatalog.tsx`

**Interfaces:**
- `useModelCatalog()` returns: `{ models, isLoading, busy, form, setForm, showForm, editingId, startCreate, startEdit, resetForm, handleSubmit, deleteTarget, handleDelete, confirmDelete, setDeleteTarget }`
- `CatalogForm` + `emptyForm` live in the hook file (or `modelCatalogTypes.ts` if preferred — one place only).

- [ ] **Step 1: Extract hook with all state/handlers from current `ModelCatalog.tsx`**

- [ ] **Step 2: Extract table + form presentational components**

- [ ] **Step 3: `ModelCatalog.tsx` composes hook + table + form + ConfirmModal**

```powershell
(Get-Content frontend/src/components/settings/ModelCatalog.tsx).Count  # ≤300
cd frontend; npm test -- ModelCatalog
```

If no dedicated test file, run Settings-related vitest or full `npm test` subset that covers hooks.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useModelCatalog.ts frontend/src/components/settings/ModelCatalog*.tsx
git commit -m "refactor(fe): extract useModelCatalog and ModelCatalog table/form"
```

---

### Task 7: FE — Dashboard split

**Files:**
- Create: `frontend/src/pages/dashboard/isSameConversation.ts`
- Create: `frontend/src/pages/dashboard/DashboardSidebar.tsx`
- Create: `frontend/src/pages/dashboard/NewConversationModal.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`

**Interfaces:**
- `isSameConversation(left, right): boolean` — move existing helper
- `DashboardSidebar` props: conversations list state, rename/delete handlers, selectConversation, MessageSearch wiring
- `NewConversationModal` props: show, title, setters, onCreate, onHide

- [ ] **Step 1: Extract `isSameConversation` + sidebar list UI + new-conversation modal**

Keep orchestration (URL params, mutations, ConfirmModal delete) in `Dashboard.tsx`.

- [ ] **Step 2: LOC + smoke import**

```powershell
(Get-Content frontend/src/pages/Dashboard.tsx).Count  # ≤300
cd frontend; npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/dashboard frontend/src/pages/Dashboard.tsx
git commit -m "refactor(fe): split Dashboard sidebar and new-conversation modal"
```

---

### Task 8: FE — ChatBoxOptimized trim

**Files:**
- Create: `frontend/src/components/chat/ChatHiddenFileInputs.tsx`
- Create: `frontend/src/components/chat/ChatPromptApply.tsx` **or** inline keep apply handler — prefer extracting hidden inputs + a tiny `applySystemPrompt` callback file only if needed for LOC
- Modify: `frontend/src/components/ChatBoxOptimized.tsx`
- Test: `frontend/src/components/ChatBoxOptimized.test.tsx`

**Split plan (minimal):**
1. Move the two hidden `<input type="file">` blocks into `ChatHiddenFileInputs.tsx`.
2. If still >300, extract DocumentModal+PromptLibraryModal JSX block into `ChatBoxModals.tsx` with the same props.

Do **not** change hook wiring order or prop contracts of `MessageList` / `MessageInput` / `ChatControls`.

- [ ] **Step 1: Extract hidden inputs (and modals if needed)**

- [ ] **Step 2: Tests + LOC**

```powershell
(Get-Content frontend/src/components/ChatBoxOptimized.tsx).Count  # ≤300
cd frontend; npm test -- ChatBoxOptimized.test.tsx
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/chat/ChatHiddenFileInputs.tsx frontend/src/components/chat/ChatBoxModals.tsx frontend/src/components/ChatBoxOptimized.tsx
git commit -m "refactor(fe): trim ChatBoxOptimized via hidden inputs/modals extract"
```

(Only `git add` files that actually exist after the split.)

---

### Task 9: FE — useChatStream helpers

**Files:**
- Create: `frontend/src/hooks/chatStreamHelpers.ts`
- Modify: `frontend/src/hooks/useChatStream.ts`
- Keep exporting `AttachedImage`, `UseChatStreamArgs`, `useChatStream` from `useChatStream.ts` (callers import types from here).

**Interfaces:**
- `createStreamBatcher(setStreamedText)` → `{ queueToken, flushNow, cancel }` wrapping rAF logic
- `appendOrReplaceAssistant(prev, assistantMsg, replaceAssistantIndex): Message[]`
- Optional: `buildChatRequestOptions({ temperature, maxTokens, selectedDocIds, attachedImage, chatAttachments, extra })`

- [ ] **Step 1: Add unit test for `appendOrReplaceAssistant`**

Create `frontend/src/hooks/chatStreamHelpers.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { appendOrReplaceAssistant } from './chatStreamHelpers';
import type { Message } from '../types/api';

describe('appendOrReplaceAssistant', () => {
  const base: Message[] = [
    { role: 'user', content: 'u' },
    { role: 'assistant', content: 'old' },
  ];
  const next: Message = { role: 'assistant', content: 'new' };

  it('appends when no replace index', () => {
    expect(appendOrReplaceAssistant(base, next).map((m) => m.content)).toEqual([
      'u',
      'old',
      'new',
    ]);
  });

  it('replaces assistant at index', () => {
    expect(
      appendOrReplaceAssistant(base, next, 1).map((m) => m.content)
    ).toEqual(['u', 'new']);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd frontend && npm test -- chatStreamHelpers.test.ts`

- [ ] **Step 3: Implement helpers; rewrite `useChatStream` to use them**

Behavior must stay identical: abort partial append, SSE error message text, fallback to `/send`, invalidate queries, clear attachments on success.

Confirm `(Get-Content frontend/src/hooks/useChatStream.ts).Count -le 300`.

- [ ] **Step 4: Run tests**

```powershell
cd frontend; npm test -- chatStreamHelpers.test.ts ChatBoxOptimized.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/chatStreamHelpers.ts frontend/src/hooks/chatStreamHelpers.test.ts frontend/src/hooks/useChatStream.ts
git commit -m "refactor(fe): extract chatStreamHelpers; slim useChatStream"
```

---

### Task 10: Final gate — LOC recount + full suites

**Files:** none new (verification only)

- [ ] **Step 1: Recount all targets**

```powershell
$targets = @(
  'backend/src/controllers/chatController.ts',
  'backend/src/controllers/documentsController.ts',
  'backend/src/controllers/settingsController.ts',
  'frontend/src/components/PromptLibraryModal.tsx',
  'frontend/src/components/chat/DocumentModal.tsx',
  'frontend/src/components/settings/ModelCatalog.tsx',
  'frontend/src/components/ChatBoxOptimized.tsx',
  'frontend/src/hooks/useChatStream.ts',
  'frontend/src/pages/Dashboard.tsx'
)
$targets | ForEach-Object {
  $n = (Get-Content $_).Count
  $gate = if ($_ -like 'backend*') { 180 } else { 300 }
  '{0,4} / {1}  {2}  {3}' -f $n, $gate, $(if ($n -le $gate) {'OK'} else {'FAIL'}), $_
}
```

Expected: all `OK`.

- [ ] **Step 2: Full test suites**

```powershell
cd backend; npm test
cd ../frontend; npm test
```

Expected: PASS (or only pre-existing failures unrelated to this wave — do not ignore new failures).

- [ ] **Step 3: Manual smoke checklist (document in PR body)**

- [ ] Settings GET/PUT (incl. key clear / reject placeholder)
- [ ] Document upload / list / retry or reindex path if available
- [ ] Prompt library preset + mine
- [ ] Model catalog create/edit/delete
- [ ] Dashboard select / rename / delete conversation
- [ ] Chat stream + stop

- [ ] **Step 4: No commit unless a fix was needed; if fix, commit as `fix: …` then re-run Step 1–2**

---

## Self-review (plan vs spec)

| Spec item | Task |
|-----------|------|
| settingsController → settingsService | Task 1 |
| documentsController → httpErrors | Task 2 |
| chatController → sse + httpHelpers | Task 3 |
| PromptLibraryModal | Task 4 |
| DocumentModal | Task 5 |
| ModelCatalog | Task 6 |
| Dashboard | Task 7 |
| ChatBoxOptimized | Task 8 |
| useChatStream | Task 9 |
| Gates + tests + smoke | Task 10 |
| Order BE settings→docs→chat; FE Prompt→Doc→Catalog→Dash→ChatBox→stream | Tasks 1–9 |
| No API/UX change; one PR atomic commits | Global + each commit step |

No TBD placeholders. Helper names are consistent across tasks (`classifyReindexError`, `appendOrReplaceAssistant`, `writeSse`).

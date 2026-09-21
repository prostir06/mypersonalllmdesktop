# v14 Memory + UX + Deep E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship conversation memory (summary + editable notes), a capped UX audit→polish pass, and deep Playwright coverage (citation, memory, settings, hardened stream).

**Architecture:** Sequential hard gates on one design: P47 persists memory and injects it into `buildSystemContext`, then triggers best-effort async summarize after turns; P48 audits four surfaces and lands ≤6 polish fixes; P49 extends `e2e/` under the existing Docker smoke workflow. Do **not** start the next phase until the prior gate is green.

**Tech Stack:** Prisma/Postgres, Express, React/Vite, Jest, Vitest, Playwright (`e2e/`).

**Spec:** `docs/superpowers/specs/2026-09-21-project-evolution-v14-memory-ux-e2e-design.md`

## Global Constraints

- Additive API/schema only; no breaking JSON keys.
- Summarize failures must never fail the user chat turn.
- Caps: max **20** notes/conversation; note content ≤**500** chars; notes block in prompt ≤**2k**; summary ≤**4k**.
- Env defaults: `SUMMARY_THRESHOLD=40`, `SUMMARY_EVERY_N=20`.
- UX polish: ≤**10** audit findings, ≤**6** polish items; no theme redesign.
- E2E: skip with explicit reason if LLM/embeddings unavailable — never silent pass.
- Do not commit unrelated dirty `README.md` / openai-sdk spec.
- `docs/superpowers/plans/` is gitignored — use `git add -f` when committing this plan.

### File map

| Path | Role |
|------|------|
| `backend/prisma/schema.prisma` + migration | `summary`, `summaryUpdatedAt`, `ConversationMemoryNote` |
| `backend/src/services/conversationMemoryService.ts` | Notes CRUD, caps, getMemory, summarize |
| `backend/src/services/chat/systemContext.ts` | Inject notes + summary |
| `backend/src/services/ChatService.ts` | Fire-and-forget summarize after persist |
| `backend/src/controllers/conversationMemoryController.ts` | HTTP adapters |
| `backend/src/routes/conversations.ts` | Mount memory routes **before** `/:conversationId` where needed |
| `frontend/src/services/api/conversations.ts` | Memory API client |
| `frontend/src/components/chat/MemoryPanel.tsx` (+ hook) | Notes + summary UI |
| `frontend/src/components/ChatBoxOptimized.tsx` | Wire panel |
| `docs/superpowers/specs/2026-09-21-v14-ux-audit.md` | P48 audit artifact |
| `e2e/citation.spec.ts`, `memory.spec.ts`, `settings-roundtrip.spec.ts` | New E2E |
| `e2e/stream.spec.ts`, `e2e/stream-stop.spec.ts` | Harden |

---

# Phase P47 — Memory

### Task 1: Prisma schema + migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/20260921120000_conversation_memory/migration.sql`

- [ ] **Step 1: Extend Conversation and add ConversationMemoryNote**

On `Conversation` add:

```prisma
  summary           String?   @db.Text
  summaryUpdatedAt  DateTime? @map("summary_updated_at")
  memoryNotes       ConversationMemoryNote[]
```

New model:

```prisma
model ConversationMemoryNote {
  id             Int      @id @default(autoincrement())
  conversationId Int      @map("conversation_id")
  content        String   @db.VarChar(500)
  createdAt      DateTime @default(now()) @map("created_at")
  updatedAt      DateTime @default(now()) @updatedAt @map("updated_at")

  conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId], map: "idx_memory_notes_conversation_id")
  @@map("conversation_memory_notes")
}
```

Migration SQL:

```sql
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary" TEXT;
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "summary_updated_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "conversation_memory_notes" (
  "id" SERIAL PRIMARY KEY,
  "conversation_id" INTEGER NOT NULL,
  "content" VARCHAR(500) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "conversation_memory_notes_conversation_id_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "idx_memory_notes_conversation_id"
  ON "conversation_memory_notes"("conversation_id");
```

- [ ] **Step 2: Generate client**

Run: `cd backend && npx prisma generate`  
Expected: success

- [ ] **Step 3: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/20260921120000_conversation_memory
git commit -m "feat(db): add conversation summary and memory notes"
```

---

### Task 2: `conversationMemoryService` (TDD)

**Files:**
- Create: `backend/src/services/conversationMemoryService.ts`
- Create: `backend/src/__tests__/conversationMemoryService.test.ts`

**Interfaces:**
- `MAX_NOTES = 20`, `MAX_NOTE_CHARS = 500`, `MAX_NOTES_PROMPT_CHARS = 2000`, `MAX_SUMMARY_CHARS = 4000`
- `getMemory(userId, conversationId): Promise<{ summary, summaryUpdatedAt, notes }>`
- `createNote(userId, conversationId, content): Promise<note>`
- `updateNote(userId, conversationId, noteId, content): Promise<note>`
- `deleteNote(userId, conversationId, noteId): Promise<void>`
- `buildMemorySystemMessages(conversationId): Promise<ChatMessage[]>` — notes then summary blocks
- `maybeRefreshSummary(userId, conversationId, opts?: { force?: boolean }): Promise<void>` — best-effort
- Throws `ChatError`-like or custom `MemoryError` with `statusCode` 403/404/400/409

- [ ] **Step 1: Write failing tests**

```typescript
jest.mock('../config/prisma', () => ({
  __esModule: true,
  default: {
    conversation: {
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(), // if used
    },
    conversationMemoryNote: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    message: { count: jest.fn() },
  },
}));

import {
  createNote,
  buildMemorySystemMessages,
  MAX_NOTES,
} from '../services/conversationMemoryService';

describe('conversationMemoryService', () => {
  it('rejects create when at MAX_NOTES', async () => {
    // mock ownership ok, count === MAX_NOTES → expect statusCode 409
  });

  it('buildMemorySystemMessages orders notes then summary', async () => {
    // mock notes + summary → expect two system messages with UA labels
  });

  it('truncates note content over 500', async () => {
    // or rejects 400 — pick one and match service
  });
});
```

Prefer **400** on content >500; **409** when note count ≥20.

- [ ] **Step 2: Run — expect FAIL**

`cd backend && npx jest src/__tests__/conversationMemoryService.test.ts --verbose`

- [ ] **Step 3: Implement service**

Ownership: `prisma.conversation.findFirst({ where: { id, userId } })` — if missing → 404.

Prompt blocks (Ukrainian labels matching pinned style):

```typescript
content: `🧠 НОТАТКИ ПАМ'ЯТІ:\n\n${joinedNotes}`
content: `🧾 ПІДСУМОК РОЗМОВИ:\n\n${summary}`
```

`maybeRefreshSummary`:
1. Load conversation (ownership)
2. `message.count` for conversation
3. If `!force` and count ≤ `SUMMARY_THRESHOLD` → return
4. If `!force` and messages since `summaryUpdatedAt` < `SUMMARY_EVERY_N` → return  
   (approximate: `message.count({ where: { conversationId, createdAt: { gt: summaryUpdatedAt } } })`)
5. Load recent raw messages (cap e.g. 80), call provider via `ProviderFactory.sendMessage` with a fixed summarize system prompt
6. Truncate to 4k; `conversation.update({ summary, summaryUpdatedAt: new Date() })`
7. Catch all → `logger.warn` only

- [ ] **Step 4: Tests PASS + commit**

```bash
git add backend/src/services/conversationMemoryService.ts backend/src/__tests__/conversationMemoryService.test.ts
git commit -m "feat(be): conversation memory service with caps and summarize"
```

---

### Task 3: Inject memory into `systemContext`

**Files:**
- Modify: `backend/src/services/chat/systemContext.ts`
- Modify: `backend/src/services/chat/prepare.ts` (pass `conversationId` into context if not already)
- Test: extend existing systemContext/prepare tests or add unit

**Interfaces:**
- `buildSystemContext(userId, options, userMessage, conversationId?: number)`

- [ ] **Step 1: Failing test** — when `conversationId` set, system messages include memory blocks from mocked `buildMemorySystemMessages`

- [ ] **Step 2: Call memory builder after pinned prompts, before attachments/RAG**

```typescript
if (conversationId != null) {
  const memoryMsgs = await buildMemorySystemMessages(conversationId);
  systemMessages.push(...memoryMsgs);
}
```

Wire `conversationId` from `prepareMessages` after `ensureConversationId`.

- [ ] **Step 3: Run chat/prepare related jest + commit**

```bash
git commit -m "feat(chat): inject conversation memory into system context"
```

---

### Task 4: Trigger summarize after successful turns

**Files:**
- Modify: `backend/src/services/ChatService.ts`

- [ ] **Step 1: After `persistTurn` in `sendMessage` and `streamMessage`, fire-and-forget**

```typescript
void maybeRefreshSummary(input.userId, convId).catch((err) => {
  logger.warn(`maybeRefreshSummary skipped: ${err instanceof Error ? err.message : err}`);
});
```

Do **not** await in the request path beyond scheduling.

- [ ] **Step 2: Unit test with mocked service that throws — sendMessage still returns 200-shaped result**

- [ ] **Step 3: Commit**

```bash
git commit -m "feat(chat): best-effort async summary refresh after turns"
```

---

### Task 5: HTTP routes + controller

**Files:**
- Create: `backend/src/controllers/conversationMemoryController.ts`
- Modify: `backend/src/routes/conversations.ts`
- Create: `backend/src/__tests__/conversationMemoryApi.test.ts` (supertest pattern like `conversations.test.ts`)

**Route order (critical):** register memory paths **before** bare `/:conversationId`:

```typescript
router.get('/:conversationId/memory', auth, getMemory);
router.post('/:conversationId/memory-notes', auth, createMemoryNote);
router.patch('/:conversationId/memory-notes/:noteId', auth, updateMemoryNote);
router.delete('/:conversationId/memory-notes/:noteId', auth, deleteMemoryNote);
router.post('/:conversationId/memory/refresh-summary', auth, refreshSummary);
```

Controller: parse ids, map `statusCode` errors via `jsonError`, else 500.

- [ ] **Step 1: API tests** — 401 without token; 404 wrong owner; create/list/patch/delete; 409 at cap

- [ ] **Step 2: Implement controller + routes**

- [ ] **Step 3: `npx jest src/__tests__/conversationMemoryApi.test.ts` PASS + commit**

```bash
git commit -m "feat(api): conversation memory notes and summary endpoints"
```

---

### Task 6: FE memory API + MemoryPanel

**Files:**
- Modify: `frontend/src/services/api/conversations.ts`
- Create: `frontend/src/hooks/useConversationMemory.ts`
- Create: `frontend/src/components/chat/MemoryPanel.tsx`
- Modify: `frontend/src/components/ChatBoxOptimized.tsx` (or `ChatControls`) — button to open panel
- Test: `frontend/src/components/chat/MemoryPanel.test.tsx`

**API client:**

```typescript
getMemory: (id) => api.get(`/conversations/${id}/memory`),
createMemoryNote: (id, content) => api.post(`/conversations/${id}/memory-notes`, { content }),
updateMemoryNote: (id, noteId, content) => api.patch(`/conversations/${id}/memory-notes/${noteId}`, { content }),
deleteMemoryNote: (id, noteId) => api.delete(`/conversations/${id}/memory-notes/${noteId}`),
refreshSummary: (id) => api.post(`/conversations/${id}/memory/refresh-summary`),
```

**UI:** Bootstrap Offcanvas/Modal — notes list, add form, edit/delete, summary textarea read-only, button «Оновити зараз». `data-testid="memory-panel"`, `data-testid="memory-summary"`, `data-testid="memory-note"`.

- [ ] **Step 1: Vitest** — renders notes; calls create on submit (mocked API)

- [ ] **Step 2: Implement hook + panel + wire when `conversationId` set**

- [ ] **Step 3: `npm test -- MemoryPanel` + commit**

```bash
git commit -m "feat(fe): conversation memory panel for notes and summary"
```

---

### Task 7: P47 gate

- [ ] **Step 1:** `cd backend && npm test`  
- [ ] **Step 2:** `cd frontend && npm test`  
- [ ] **Step 3:** Manual smoke — create note, refresh summary (dev LLM), send chat, confirm context feels aware  
- [ ] **Step 4:** Stop for human checkpoint before P48 (if executing-plans)

---

# Phase P48 — UX audit → polish

### Task 8: UX audit artifact

**Files:**
- Create: `docs/superpowers/specs/2026-09-21-v14-ux-audit.md`

- [ ] **Step 1: Walk Chat, Dashboard, Documents modal, Settings/catalog**

Record ≤10 findings:

```markdown
| id | surface | sev | problem | proposed fix |
|----|---------|-----|---------|--------------|
| U1 | Chat | M | ... | ... |
```

- [ ] **Step 2: Mark ≤6 as `polish: yes`**

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-v14-ux-audit.md
git commit -m "docs(ux): v14 audit findings for polish shortlist"
```

---

### Task 9: Polish items (repeat per finding)

**Pattern for each of ≤6 items:**

- [ ] **Step 1: Write/adjust failing test if behavior is assertable**
- [ ] **Step 2: Minimal UI/copy fix — no redesign**
- [ ] **Step 3: Targeted vitest/jest green**
- [ ] **Step 4: Commit** `fix(ux): <short finding id and fix>`

Do not invent extras beyond the shortlist.

---

### Task 10: P48 gate

- [ ] Manual smoke chat/docs/settings  
- [ ] Confirm audit has ≤6 polished items checked off  
- [ ] Human checkpoint before P49

---

# Phase P49 — Deep E2E

### Task 11: Citation E2E

**Files:**
- Create: `e2e/citation.spec.ts`

```typescript
test('RAG citation shows sources after asking about uploaded txt', async ({ page, request }) => {
  // register+login
  // open docs modal, upload unique keyword file, wait list
  // select checkbox for doc
  // ask question containing keyword
  // expect page.locator('.message-sources') or getByText('Джерела')
  // if stream/RAG unhealthy: test.skip(true, 'RAG/LLM unavailable')
});
```

- [ ] Run against local Docker when available; commit when green or skip-path verified

```bash
git commit -m "test(e2e): assert RAG citation sources in UI"
```

---

### Task 12: Memory E2E

**Files:**
- Create: `e2e/memory.spec.ts`

Flow: login → open memory panel → add note with unique text → reload dashboard `?conversation=` → note visible → click refresh summary → assert `[data-testid=memory-summary]` non-empty **or** skip if summarize provider down.

```bash
git commit -m "test(e2e): conversation memory notes and summary UI"
```

---

### Task 13: Settings round-trip E2E

**Files:**
- Create: `e2e/settings-roundtrip.spec.ts` (or extend `settings.spec.ts`)

Change `system_prompt` or temperature → save → reload `/settings` → expect persisted value.

```bash
git commit -m "test(e2e): settings round-trip persistence"
```

---

### Task 14: Harden stream specs

**Files:**
- Modify: `e2e/stream.spec.ts`, `e2e/stream-stop.spec.ts`

Add asserts: assistant/streaming text visible (not only SSE headers); keep stop → composer enabled.

```bash
git commit -m "test(e2e): harden stream and stop assertions"
```

---

### Task 15: P49 + wave gate

- [ ] `cd e2e && npm test` against `docker compose` stack (same as CI)  
- [ ] BE + FE full unit suites green  
- [ ] Update design status line to Implemented (P47–P49) in a docs commit if desired  

```bash
git commit -m "docs: mark v14 P47–P49 implemented"
```

---

## Self-review (plan vs spec)

| Spec requirement | Tasks |
|------------------|-------|
| Schema summary + notes | Task 1 |
| Caps 20 / 500 / 2k / 4k | Task 2 |
| CRUD + refresh API | Task 5 |
| Inject into systemContext | Task 3 |
| Async summarize after turn | Task 4 |
| FE panel | Task 6 |
| UX audit ≤10 / polish ≤6 | Tasks 8–9 |
| E2E citation/memory/settings/stream | Tasks 11–14 |
| Phase order P47→P48→P49 | Section structure + gates 7/10/15 |

No TBD placeholders. Helper names consistent (`maybeRefreshSummary`, `buildMemorySystemMessages`, `MemoryPanel`).

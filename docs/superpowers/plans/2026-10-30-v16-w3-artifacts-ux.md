# Wave 3: Interactive Artifacts & Pinned Chats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an interactive visual artifact viewer with an isolated, secure iframe sandbox for HTML and SVG code, and provide conversation pinning in the database and sidebar.

**Architecture:**
- **Pinned Chats**: Add `isPinned` Boolean column to the `Conversation` Prisma model, add a `PATCH /api/conversations/:id/pin` endpoint, and update `DashboardSidebar.tsx` to group pinned conversations at the top with interactive pin/unpin toggles.
- **Interactive Artifacts**: Parse assistant markdown messages via `artifactParser.ts` to detect standalone HTML and SVG code blocks. Render an action button inside the assistant message bubble in `MessageItem.tsx` that opens `ArtifactPanel.tsx`.
- **Sandbox Security**: `ArtifactPanel.tsx` embeds code into an `<iframe>` configured strictly with `sandbox="allow-scripts"` (strictly NO `allow-same-origin`), isolating execution from parent DOM, cookies, and local storage. Features preview/code tabs, copy, download, and fullscreen.

**Tech Stack:** React 18, TypeScript 5.6, Express, Prisma ORM, PostgreSQL, React-Bootstrap, Vitest, Jest.

## Global Constraints
- Node >= 20.18.0, npm >= 10.8.2.
- Zero secret leakage in logs, git history, or database queries.
- Strict iframe sandboxing: `sandbox="allow-scripts"`, never `allow-same-origin`.
- Maintain 100% passing tests across backend (Jest), frontend (Vitest), desktop (Node test runner), and CI audit checks.

---

### Task 1: Database & Backend Pinning API

**Files:**
- Modify: `backend/prisma/schema.prisma:50-68`
- Create: `backend/prisma/migrations/20261030170000_add_is_pinned_to_conversations/migration.sql`
- Modify: `backend/src/services/conversationsService.ts:16-80`
- Modify: `backend/src/controllers/conversationsController.ts:35-80`
- Modify: `backend/src/routes/conversations.ts:20-38`
- Modify: `backend/src/__tests__/conversations.test.ts`

**Interfaces:**
- Consumes: Prisma schema, Express router, `AuthRequest`.
- Produces: `Conversation.isPinned` field, `PATCH /api/conversations/:conversationId/pin` endpoint, `toListItem` with `is_pinned`.

- [ ] **Step 1: Update Prisma schema and add migration**

In `backend/prisma/schema.prisma`:
Add `isPinned Boolean @default(false) @map("is_pinned")` to `model Conversation`.
Add `@@index([userId, isPinned, updatedAt(sort: Desc)], map: "idx_conversations_user_pin_updated")`.

Create `backend/prisma/migrations/20261030170000_add_is_pinned_to_conversations/migration.sql`:
```sql
-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "is_pinned" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "idx_conversations_user_pin_updated" ON "conversations"("user_id", "is_pinned", "updated_at" DESC);
```
Run `npx prisma generate --schema=backend/prisma/schema.prisma`.

- [ ] **Step 2: Write failing backend unit tests for conversation pinning**

In `backend/src/__tests__/conversations.test.ts`, add test cases:
1. `listForUser orders pinned conversations before unpinned conversations`.
2. `togglePinForUser toggles isPinned from false to true and true to false`.
3. `PATCH /api/conversations/:conversationId/pin updates pin status and returns updated item`.

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/conversations.test.ts"`
Expected: Tests fail (functions/endpoints not implemented).

- [ ] **Step 3: Implement pinning in conversationsService and conversationsController**

In `backend/src/services/conversationsService.ts`:
- Update `toListItem` to return `is_pinned: Boolean(row.isPinned)`.
- Update `listForUser` to query `select: { id: true, title: true, createdAt: true, updatedAt: true, isPinned: true }` and `orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }]`.
- Add `togglePinForUser(userId: number, id: number, isPinned?: boolean)`:
  Fetches existing conversation, toggles `isPinned`, updates row, and returns updated conversation.

In `backend/src/controllers/conversationsController.ts`:
- Add `togglePinConversation(req: AuthRequest, res: Response)`:
  Parses `conversationId`, reads optional `req.body.is_pinned`, calls `ConversationsService.togglePinForUser`, returns 200 with `ConversationsService.toListItem(updated)` (or 404 if not found).

In `backend/src/routes/conversations.ts`:
- Register `router.patch('/:conversationId/pin', auth, togglePinConversation);`.

- [ ] **Step 4: Run backend tests and verify pass**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/conversations.test.ts"`
Expected: All tests pass.

- [ ] **Step 5: Run backend lint and typecheck**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Expected: 0 errors.

- [ ] **Step 6: Commit changes**

Commit: `feat(be): add is_pinned column and conversation pin toggle endpoint`

---

### Task 2: Frontend API Client & Pinned Conversations in Sidebar

**Files:**
- Modify: `frontend/src/types/api.ts:30-40`
- Modify: `frontend/src/services/api/conversations.ts` (or `frontend/src/services/api.ts`)
- Modify: `frontend/src/hooks/useConversations.ts`
- Modify: `frontend/src/pages/dashboard/DashboardSidebar.tsx`
- Modify: `frontend/src/pages/Dashboard.tsx`
- Modify: `frontend/src/pages/dashboard/DashboardSidebar.test.tsx`

**Interfaces:**
- Consumes: `PATCH /api/conversations/:id/pin` endpoint, `Conversation.is_pinned`.
- Produces: `useTogglePinConversation` hook, pinned conversation grouping and pin toggle button in `DashboardSidebar`.

- [ ] **Step 1: Write failing frontend tests for pinned sidebar items**

In `frontend/src/pages/dashboard/DashboardSidebar.test.tsx`:
Add tests:
1. Renders pinned section header when conversations with `is_pinned: true` exist.
2. Calls `onTogglePin` when pin button is clicked.
3. Renders appropriate title/icon for pinned vs unpinned items.

Run: `npm test --prefix frontend -- src/pages/dashboard/DashboardSidebar.test.tsx`
Expected: Tests fail.

- [ ] **Step 2: Update frontend types and API client**

In `frontend/src/types/api.ts`:
Ensure `Conversation` interface includes `is_pinned?: boolean;`.

In `frontend/src/services/api/conversations.ts` (or `frontend/src/services/api.ts`):
Add `togglePin: (id: string | number, is_pinned?: boolean) => axios.patch(`/api/conversations/${id}/pin`, { is_pinned })`.

In `frontend/src/hooks/useConversations.ts`:
Add `useTogglePinConversation`:
Uses React Query's `useMutation` to call `togglePin` and invalidates `queryKeys.conversations`.

- [ ] **Step 3: Update DashboardSidebar and Dashboard**

In `frontend/src/pages/dashboard/DashboardSidebar.tsx`:
- Add `onTogglePin?: (convId: string | number, e: MouseEvent) => void` to `Props`.
- Group conversations:
  `const pinned = conversations.filter(c => c.is_pinned);`
  `const others = conversations.filter(c => !c.is_pinned);`
- If `pinned.length > 0`:
  Render `<div className="small text-uppercase text-muted fw-bold px-2 py-1">📌 Закріплені</div>` followed by pinned cards.
  Render `<div className="small text-uppercase text-muted fw-bold px-2 py-1 mt-2">💬 Нещодавні</div>` followed by remaining cards.
- On each conversation card, render a pin button:
  `<Button variant="link" size="sm" onClick={(e) => onTogglePin?.(conv.id, e)} title={conv.is_pinned ? 'Відкріпити розмову' : 'Закріпити розмову'}>`
  Icon: `📌` (with opacity/highlight reflecting pinned state).

In `frontend/src/pages/Dashboard.tsx`:
- Call `const togglePinMutation = useTogglePinConversation();`.
- Pass `onTogglePin={(id, e) => { e.stopPropagation(); togglePinMutation.mutate(id); }}` to `DashboardSidebar`.

- [ ] **Step 4: Run frontend tests and verify pass**

Run: `npm test --prefix frontend -- src/pages/dashboard/DashboardSidebar.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run frontend lint and typecheck**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Expected: 0 errors.

- [ ] **Step 6: Commit changes**

Commit: `feat(fe): support pinned conversations grouping and toggle in sidebar`

---

### Task 3: Artifact Detection & Parser Utility (`artifactParser.ts`)

**Files:**
- Create: `frontend/src/utils/artifactParser.ts`
- Create: `frontend/src/utils/artifactParser.test.ts`
- Modify: `frontend/src/types/api.ts`

**Interfaces:**
- Consumes: Raw assistant message content string.
- Produces: `Artifact` type and `parseArtifacts(content: string): Artifact[]`.

- [ ] **Step 1: Write failing unit tests for artifact parser**

Create `frontend/src/utils/artifactParser.test.ts`:
Test cases:
1. Detects ````html <!DOCTYPE html><html><body><h1>Hello</h1></body></html> ```` as an HTML artifact.
2. Detects ````html <div class="card">Hello</div> ```` with HTML elements as an HTML artifact.
3. Detects ````xml <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg> ```` or ````svg ... ```` as an SVG artifact.
4. Ignores plain code blocks (e.g. ````javascript console.log(1); ```` or ````python def foo(): pass ````).
5. Extracts title from markdown comment, heading, or generates sensible default (e.g. "Інтерактивний HTML", "Векторне зображення SVG").
6. Handles multiple artifacts in a single message.
7. Ignores empty or invalid code blocks safely without throwing.

Run: `npm test --prefix frontend -- src/utils/artifactParser.test.ts`
Expected: Test fails (file does not exist).

- [ ] **Step 2: Implement artifactParser.ts**

In `frontend/src/types/api.ts`:
Add:
```typescript
export interface Artifact {
  id: string;
  type: 'html' | 'svg';
  title: string;
  language: string;
  content: string;
}
```

Create `frontend/src/utils/artifactParser.ts`:
Implement `parseArtifacts(markdown: string): Artifact[]`:
- Uses regex to match fenced code blocks: `/```(?:([a-zA-Z0-9_-]+))?\s*\n([\s\S]*?)```/g`.
- For each code block:
  - Check if language is `html` or `svg`, or `xml` containing `<svg`.
  - Validate that content contains valid HTML markup (`<html`, `<!doctype`, `<div`, `<button`, `<canvas`, `<svg`, `<style`, etc.).
  - Extract title from leading comment (e.g. `<!-- title: My App -->` or `<!-- My App -->`) or first heading, falling back to "HTML Артефакт" or "SVG Графіка".
  - Generate deterministic or sequential `id` (e.g. `artifact-1`, `artifact-2`).
- Returns array of detected `Artifact` objects.

- [ ] **Step 3: Run unit tests and verify pass**

Run: `npm test --prefix frontend -- src/utils/artifactParser.test.ts`
Expected: All tests pass.

- [ ] **Step 4: Commit changes**

Commit: `feat(fe): implement artifact parser for interactive html and svg code`

---

### Task 4: Sandbox Preview & Interactive Artifact Panel (`ArtifactPanel.tsx`)

**Files:**
- Create: `frontend/src/components/chat/ArtifactPanel.tsx`
- Create: `frontend/src/components/chat/ArtifactPanel.test.tsx`

**Interfaces:**
- Consumes: `Artifact` object, callbacks (`onClose`).
- Produces: `ArtifactPanel` component with preview iframe, code viewer, download, copy, and fullscreen.

- [ ] **Step 1: Write failing unit tests for ArtifactPanel**

Create `frontend/src/components/chat/ArtifactPanel.test.tsx`:
Test cases:
1. Renders artifact title and type badge.
2. Renders sandboxed `<iframe>` with `sandbox="allow-scripts"` and strictly NO `allow-same-origin`.
3. Injects artifact content into iframe `srcDoc`.
4. Switches between "Попередній перегляд" and "Код" tabs.
5. In "Код" tab, displays raw code text.
6. Calls `onClose` when close button is clicked.
7. Handles "Копіювати код" and file download.

Run: `npm test --prefix frontend -- src/components/chat/ArtifactPanel.test.tsx`
Expected: Test fails (component does not exist).

- [ ] **Step 2: Implement ArtifactPanel.tsx**

Create `frontend/src/components/chat/ArtifactPanel.tsx`:
- Props: `{ artifact: Artifact; onClose: () => void; }`
- State: `activeTab: 'preview' | 'code'`, `isFullscreen: boolean`.
- Header:
  - Title and badge (`HTML` / `SVG`).
  - Action buttons:
    - 📋 Копіювати (calls `copyTextWithToast`).
    - ⬇️ Завантажити (creates object URL blob download with `.html` or `.svg`).
    - ⛶ На весь екран (toggles `isFullscreen`).
    - ✕ Закрити (calls `onClose`).
- Tabs: Nav tabs for "Попередній перегляд" and "Код".
- Preview tab:
  - Sandboxed iframe:
    ```tsx
    <iframe
      title={artifact.title}
      sandbox="allow-scripts"
      srcDoc={buildSafeSrcDoc(artifact)}
      className="w-100 h-100 border-0 bg-white rounded"
      style={{ minHeight: isFullscreen ? 'calc(100vh - 120px)' : '420px' }}
    />
    ```
  - `buildSafeSrcDoc`: wraps HTML/SVG with modern clean CSS reset and viewport meta tags so previews look polished.
- Code tab:
  - Syntax highlighted or pre-formatted code box with line count and monospace font.

- [ ] **Step 3: Run unit tests and verify pass**

Run: `npm test --prefix frontend -- src/components/chat/ArtifactPanel.test.tsx`
Expected: All tests pass.

- [ ] **Step 4: Commit changes**

Commit: `feat(fe): build ArtifactPanel with secure isolated iframe sandbox`

---

### Task 5: Chat Integration (MessageItem Action & Split View in ChatBoxOptimized)

**Files:**
- Modify: `frontend/src/components/chat/MessageItem.tsx`
- Modify: `frontend/src/components/chat/MessageList.tsx`
- Modify: `frontend/src/components/ChatBoxOptimized.tsx`
- Modify: `frontend/src/components/chat/MessageItem.sources.test.tsx`
- Modify: `frontend/src/components/ChatBoxOptimized.test.tsx`

**Interfaces:**
- Consumes: `parseArtifacts`, `ArtifactPanel`, `Artifact`.
- Produces: Action button inside assistant bubbles, split-view container in `ChatBoxOptimized`.

- [ ] **Step 1: Write failing unit tests for MessageItem artifact button and ChatBox split view**

In `frontend/src/components/chat/MessageItem.sources.test.tsx`:
Add tests:
1. Renders "🎨 Переглянути артефакт: ..." button for assistant messages containing HTML/SVG artifacts.
2. Clicking the artifact button calls `onOpenArtifact(artifact)`.
3. Does not render artifact button for plain messages without HTML/SVG artifacts.

In `frontend/src/components/ChatBoxOptimized.test.tsx`:
Add tests:
1. Renders `ArtifactPanel` side-by-side when an artifact is active.
2. Closes `ArtifactPanel` when close is triggered.

Run: `npm test --prefix frontend -- src/components/chat/MessageItem.sources.test.tsx src/components/ChatBoxOptimized.test.tsx`
Expected: Tests fail.

- [ ] **Step 2: Update MessageItem and MessageList**

In `frontend/src/components/chat/MessageItem.tsx`:
- Add `onOpenArtifact?: (artifact: Artifact) => void;` to `MessageItemProps`.
- When `msg.role === 'assistant'`, call `const artifacts = useMemo(() => parseArtifacts(msg.content), [msg.content]);`.
- If `artifacts.length > 0`, render:
  ```tsx
  <div className="d-flex flex-wrap gap-2 mt-2">
    {artifacts.map((art) => (
      <Button
        key={art.id}
        variant="outline-info"
        size="sm"
        className="d-inline-flex align-items-center gap-1 py-1 px-2"
        onClick={() => onOpenArtifact?.(art)}
      >
        <span>🎨</span>
        <span>Переглянути артефакт: {art.title}</span>
      </Button>
    ))}
  </div>
  ```

In `frontend/src/components/chat/MessageList.tsx`:
- Add `onOpenArtifact?: (artifact: Artifact) => void;` to `MessageListProps`.
- Forward `onOpenArtifact` to `<MessageItem ... onOpenArtifact={onOpenArtifact} />`.

- [ ] **Step 3: Update ChatBoxOptimized with split-view layout**

In `frontend/src/components/ChatBoxOptimized.tsx`:
- Add state: `const [activeArtifact, setActiveArtifact] = useState<Artifact | null>(null);`.
- If `activeArtifact` is non-null:
  Render a side-by-side split layout:
  - Left column: `MessageList` and `MessageInput`.
  - Right column: `<ArtifactPanel artifact={activeArtifact} onClose={() => setActiveArtifact(null)} />`.
- When switching conversations, clear `activeArtifact` (`useEffect(() => setActiveArtifact(null), [conversationId])`).

- [ ] **Step 4: Run frontend tests and verify pass**

Run: `npm test --prefix frontend -- src/components/chat/MessageItem.sources.test.tsx src/components/ChatBoxOptimized.test.tsx`
Expected: All tests pass.

- [ ] **Step 5: Run full frontend test suite, lint, and build**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Run: `npm test --prefix frontend`
Run: `npm run build --prefix frontend`
Expected: 0 errors, all test files pass, build succeeds.

- [ ] **Step 6: Commit changes**

Commit: `feat(fe): integrate interactive artifacts panel and split-view into chat`

---

### Task 6: Wave 3 Final Quality Gate & Whole-Wave Review

**Files:**
- Entire workspace

**Interfaces:**
- Consumes: All Wave 3 code and migrations.
- Produces: Fully verified Wave 3 branch approved by senior whole-branch review.

- [ ] **Step 1: Backend verification**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Run: `npm run audit:ci --prefix backend`
Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js`
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

Generate diff package: `git diff -U10 HEAD~5..HEAD > .superpowers/sdd/2026-10-30-v16-w3-artifacts-ux/review-whole-wave-3.diff`.
Dispatch senior code reviewer subagent.
Address any review findings if needed until `APPROVED`.

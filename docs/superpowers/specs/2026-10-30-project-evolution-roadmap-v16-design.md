# Project Evolution Roadmap v16 — Code Optimization, RAG Performance, Interactive Artifacts, Anthropic Claude

**Date:** 2026-10-30  
**Status:** Approved by User  
**Parent:** Post v15 (W1–W4 implemented) + Google Gemini Integration (Vision, Web Grounding, Encrypted Keys)  
**Scope:** Four sequential gated waves for code optimization, architectural debt cleanup, UX enhancements, and the Anthropic Claude integration  
**Approach:** Classical balanced evolution (Debt & Code Splitting → RAG & Token Accounting → Interactive Artifacts & Pinned Chats → Anthropic Claude)  
**Horizon:** Four gated waves; each wave implemented via dedicated implementation plan  

**Non-goals (for this cycle):** Redis/BullMQ (remains backlog until single-node ceiling is met), multi-tenant billing, Electron GUI E2E, vector long-term memory auto-extraction, replacing Postgres with embedded DB.

---

## 1. Executive Summary

**LLM Assistant Studio** is a full-stack personal AI assistant and control panel built on Express/Prisma (PostgreSQL + pgvector), React/Vite, an optional Electron desktop shell, Docker Compose, SSE streaming, hybrid RAG, JWT session management, and encrypted user credentials.

Recent milestones completed:
* **v15 Waves 1–4**: Docker Playwright E2E unblocking, soft lint rules, UX polish shortlist (empty states, a11y, document status), and cross-conversation User Memory (`UserMemoryNote`).
* **Google Gemini Integration**: Gemini 2.0 Flash and 1.5 Pro, Vision attachments, Google Search Grounding with web citations, and AES-256-GCM encrypted API key storage.
* **CI Artifact Storage Hardening**: Non-blocking artifact uploads with short retention days.

**Roadmap v16** tackles the next level of maturity:
1. **Wave 1 (Debt & Modularity)**: Splitting `Settings.tsx` into modular tab components, resolving React 18/19 peer dependency mismatch (removing `--legacy-peer-deps`), enabling React Router v7 future flags, and replacing vulnerable SheetJS `xlsx` with modern `exceljs`.
2. **Wave 2 (RAG & Token Accounting)**: Parallelizing vector search and FTS in RAG retrieval to cut TTFT, tracking token usage (prompt/completion/total) and estimated cost ($ USD) per message with a clean UI badge.
3. **Wave 3 (Artifacts & UX)**: An interactive side panel for live preview of HTML/SVG/JS code in a sandboxed iframe, alongside pinned conversations at the top of the sidebar.
4. **Wave 4 (Anthropic Claude Integration)**: Complete support for Claude 3.5 Sonnet and Haiku via official `@anthropic-ai/sdk`, SSE streaming, multimodal vision, and encrypted `anthropicApiKeyEnc` storage.

---

## 2. Architecture & Wave Structure

```
[Wave 1: Tech Debt & Code Modularity]
  └── Split Settings.tsx, sync React 18 types (remove --legacy-peer-deps), replace xlsx with exceljs
        ↓
[Wave 2: RAG Speed & Token/Cost Telemetry]
  └── Parallelize Vector + FTS search, persist token usage in Message.tokenUsage, calculate cost ($)
        ↓
[Wave 3: Interactive Artifacts & Pinned Chats]
  └── Sandboxed iframe Live Preview for HTML/SVG/JS + Pinned conversations in sidebar
        ↓
[Wave 4: Anthropic Claude Integration]
  └── Claude 3.5 Sonnet / Haiku, SSE streaming, Vision attachments, encrypted anthropicApiKeyEnc
```

| Wave | Primary Objective | Key Deliverables | Gate / Success Signal |
|------|-------------------|------------------|-----------------------|
| **1** | Debt & Modularity | Tabbed Settings decomposition, React 18 types alignment, SheetJS replacement with `exceljs` | `npm audit:ci` 100% clean, `npm ci` runs without `--legacy-peer-deps`, no router console warnings, all unit tests pass |
| **2** | RAG & Token Telemetry | Parallelized `retrieve.ts`, `Message.tokenUsage` in DB, cost calculation utility, UI token badge | RAG retrieval latency reduced, token stats persisted and displayed in UI, backend & frontend tests pass |
| **3** | Artifacts & UX | `ArtifactPanel.tsx` with Preview/Code tabs and sandbox security, `isPinned` in Conversation | Artifacts render safely in iframe, chat pinning persists and reorders sidebar, unit tests pass |
| **4** | Anthropic Claude | `@anthropic-ai/sdk` adapter, `anthropicApiKeyEnc` in UserSettings, Vision support, settings card | Claude models stream seamlessly via SSE, Vision works with images, encrypted keys verified |

---

## 3. Wave 1 — Technical Debt, Modularity & Security Hygiene

### 3.1 Intent
Eliminate build warnings, peer dependency conflicts, high-severity package vulnerabilities, and decompose oversized frontend components before introducing new subsystems.

### 3.2 Key Changes
1. **Decomposing `Settings.tsx` (11.3 KB)**:
   * Refactor monolithic `Settings.tsx` into a clean tabbed layout with child components under `frontend/src/components/settings/`:
     * `GeneralSettingsTab.tsx` (default model/provider, temperature, max tokens, system prompt, token display toggle).
     * `ApiKeysTab.tsx` (centralized management for encrypted API keys: OpenAI, Gemini, and future Claude).
     * `ModelsTab.tsx` (model catalog and custom endpoints).
     * `PromptsTab.tsx` (prompt library management).
     * `UserMemoryTab.tsx` (cross-conversation user memory notes).
   * `Settings.tsx` becomes a slim orchestrator with URL hash or state-driven tabs.

2. **React Type Dependency Alignment**:
   * Align `@types/react` and `@types/react-dom` in `frontend/package.json` to `~18.3.x` (matching `react: ^18.2.0`).
   * Remove `--legacy-peer-deps` from `frontend/package.json` install scripts and from `.github/workflows/ci.yml`.

3. **React Router v7 Future Flags**:
   * Configure `future: { v7_startTransition: true, v7_relativeSplatPath: true }` in `App.tsx` (or router creation) to eliminate transition warnings in test runs and console.

4. **Replace `xlsx` with `exceljs`**:
   * Replace `xlsx@0.18.5` with `exceljs` in `backend/package.json`.
   * Update `backend/src/services/documents/extraction.ts` and `backend/src/services/chat/sheetContext.ts` to parse worksheets safely without prototype pollution risks.
   * Remove SheetJS exemptions from `docs/security-audit-baseline.md`.

### 3.3 Wave 1 Gate
* `npm run lint` & `npm run typecheck` pass with zero errors in backend and frontend.
* `npm ci` installs cleanly without `--legacy-peer-deps`.
* `npm run audit:ci` passes without vulnerability exceptions.
* All existing unit and desktop tests pass.

---

## 4. Wave 2 — RAG Performance & Token/Cost Telemetry

### 4.1 Intent
Accelerate document retrieval response times and provide transparent token usage and cost accounting for AI interactions.

### 4.2 Key Changes
1. **Parallel Vector + FTS Retrieval (Performance Hotspot H2)**:
   * In `backend/src/services/embeddings/retrieve.ts`, convert sequential vector and keyword searches:
     ```typescript
     // From sequential:
     // const vectorChunks = await vectorSearch(...);
     // const ftsChunks = await ftsSearch(...);
     // To parallel:
     const [vectorChunks, ftsChunks] = await Promise.all([
       vectorSearch(documentIds, queryEmbedding, topK, minSimilarity),
       ftsSearch(documentIds, query, topK)
     ]);
     ```
   * Decreases RAG preparation latency (SLI S2) by approximately 40-50% on large document sets.

2. **Database Schema Update for Token Accounting**:
   * Update `backend/prisma/schema.prisma`:
     ```prisma
     model Message {
       // ... existing fields
       tokenUsage Json? @map("token_usage") // { promptTokens, completionTokens, totalTokens, estimatedCostUsd? }
     }
     ```
   * Create Prisma migration: `ALTER TABLE "messages" ADD COLUMN "token_usage" JSONB;`.

3. **Token & Cost Calculator (`tokenCostCalculator.ts`)**:
   * Backend utility mapping model families to standard pricing (per 1M input/output tokens):
     * GPT-4o-mini: $0.15 / $0.60
     * GPT-4o: $2.50 / $10.00
     * Gemini 2.0 Flash: $0.10 / $0.40
     * Gemini 1.5 Pro: $1.25 / $5.00
     * Claude 3.5 Sonnet: $3.00 / $15.00
     * Claude 3.5 Haiku: $0.80 / $4.00
     * Ollama: $0.00 (local)
   * Provider stream adapters extract token usage from provider completion events and emit `token_usage` SSE event before `done`.

4. **Frontend UI Badge**:
   * Display a subtle micro-badge beneath assistant messages: `450 tokens · ~$0.0004`.
   * Hover tooltip displaying breakdown: `Prompt: 380 | Completion: 70`.
   * Add a user preference in `GeneralSettingsTab` to toggle token visibility on/off.

### 4.3 Wave 2 Gate
* Unit tests verify parallel execution in `retrieve.ts`.
* Tests confirm token usage and cost calculation are persisted in `Message.tokenUsage`.
* Frontend tests verify rendering of the token badge and visibility toggle.

---

## 5. Wave 3 — Interactive Artifacts & Pinned Chats

### 5.1 Intent
Deliver rich, interactive visual outputs (code, UI components, SVG, HTML) in an isolated sandbox, and improve workspace organization through pinned conversations.

### 5.2 Key Changes
1. **Interactive Artifacts Panel (`ArtifactPanel.tsx`)**:
   * Detect standalone HTML/SVG/JS code blocks or designated artifact markdown fences in assistant responses.
   * Render an "Open Artifact" action button inside the message bubble.
   * Clicking opens a responsive side panel (Split View or Drawer):
     * **Preview Tab**: Renders the artifact in real-time.
     * **Code Tab**: Displays the source code with syntax highlighting and line numbers.
     * **Utility Actions**: Copy Code, Download File (`.html`, `.svg`), Toggle Fullscreen.

2. **Sandbox Security**:
   * Embed preview inside an `<iframe>` configured strictly with:
     `sandbox="allow-scripts"` (explicitly **no** `allow-same-origin`, **no** access to cookies, parent DOM, or localStorage).
   * Inject basic CDN styling (e.g. Tailwind CSS) into the iframe document for styling support.

3. **Pinned Conversations**:
   * Add `isPinned Boolean @default(false) @map("is_pinned")` to the `Conversation` model in Prisma.
   * Add `PATCH /api/conversations/:id/pin` endpoint to toggle pin status.
   * In `DashboardSidebar.tsx`, group conversations into a "Pinned" section at the top, followed by recent conversations.

### 5.3 Wave 3 Gate
* Artifact detection correctly identifies HTML, SVG, and web code blocks.
* The iframe sandbox prevents unauthorized access to host windows and storage.
* Pinning and unpinning conversations persists across reloads and maintains proper ordering.
* Unit tests for `ArtifactPanel` and sidebar pinning pass.

---

## 6. Wave 4 — Anthropic Claude Integration

### 6.1 Intent
Expand provider capabilities with Anthropic Claude (Claude 3.5 Sonnet, 3.5 Haiku, Claude 3 Opus), offering top-tier reasoning, code generation, and multimodal vision.

### 6.2 Key Changes
1. **Backend Claude Service (`claudeService.ts`)**:
   * Integrate official `@anthropic-ai/sdk`.
   * Implement streaming completion via `client.messages.stream(...)`, parsing text deltas and usage metadata.
   * Implement Vision support: map base64 image attachments to Claude's image content blocks (`image/jpeg`, `image/png`, `image/webp`, `image/gif`).
   * Propagate abort signals cleanly through `stream.controller.abort()`.

2. **Encrypted Key Storage & Resolution**:
   * Add `anthropicApiKeyEnc String? @map("anthropic_api_key_enc") @db.Text` to `user_settings` in Prisma schema.
   * Prisma migration: `ALTER TABLE "user_settings" ADD COLUMN "anthropic_api_key_enc" TEXT;`.
   * Implement `claudeKeyResolver.ts`: resolves user's decrypted key from DB, falls back to `ANTHROPIC_API_KEY` env var.
   * Build `ClaudeSettingsCard.tsx` in `ApiKeysTab` to validate (`sk-ant-...`) and save encrypted keys.

3. **Provider Factory & Catalog Integration**:
   * Register `'anthropic'` in `providerFactory.ts` and `modelCapabilities.ts` (Vision enabled for 3.5 Sonnet and 3.5 Haiku).
   * Update `modelsService.ts` and catalog seed with official Claude models.
   * Update `ChatControls.tsx` and model selectors to support Anthropic models.

### 6.3 Wave 4 Gate
* Unit tests for `claudeService.ts` verify streaming, vision conversion, error handling, and abort signals.
* Key encryption and resolution tests pass (`claudeKeyResolver.test.ts`).
* Full chat flow works end-to-end with Claude models (stream, token usage, vision, settings).

---

## 7. Data Flow & Cross-Cutting Policies

### 7.1 Security Policy
* **Zero Secret Leakage**: Raw API keys (`sk-ant-...`, `AIzaSy...`, `sk-...`) must never appear in server logs, Git commits, or unencrypted database columns.
* **Sandbox Integrity**: `ArtifactPanel` must never use `allow-same-origin` or execute outside the sandboxed iframe.
* **Fail-Closed Permissions**: All new endpoints require authenticated user JWT and enforce user ownership verification.

### 7.2 Error Handling & Resilience
* RAG retrieval failures fall back gracefully to standard chat without documents.
* Token calculation errors log as non-fatal warnings and do not interrupt SSE stream delivery.
* Claude API error codes (401 invalid key, 429 rate limit, 529 overloaded) map to localized user-friendly messages.

---

## 8. Testing Matrix

| Wave | Unit Tests | Integration / Component Tests | E2E / Smoke Tests |
|------|------------|-------------------------------|-------------------|
| **Wave 1** | `exceljs` extraction tests | `Settings` tabs mounting & state tests | Clean `npm ci` in CI workflow |
| **Wave 2** | `retrieve.test.ts` (parallel), `tokenCostCalculator.test.ts` | `MessageItem.test.tsx` (token badge), `ChatService.test.ts` (usage persist) | Message stream verifies token event |
| **Wave 3** | `artifactParser.test.ts` | `ArtifactPanel.test.tsx`, `DashboardSidebar.test.tsx` (pinning) | Pinning conversation persistence |
| **Wave 4** | `claudeService.test.ts`, `claudeKeyResolver.test.ts` | `ClaudeSettingsCard.test.tsx`, `ChatControls.test.tsx` | Claude model selection & streaming |

---

## 9. Implementation Roadmap & Next Steps

Upon review and approval of this specification, implementation proceeds sequentially wave by wave:
1. `docs/superpowers/plans/2026-10-30-v16-w1-debt-modularity.md`
2. `docs/superpowers/plans/2026-10-30-v16-w2-rag-tokens.md`
3. `docs/superpowers/plans/2026-10-30-v16-w3-artifacts-ux.md`
4. `docs/superpowers/plans/2026-10-30-v16-w4-anthropic-claude.md`

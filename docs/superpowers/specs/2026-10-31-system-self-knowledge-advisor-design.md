# System Self-Knowledge & Live Advisor Design (v17)

**Date:** 2026-10-31  
**Status:** Approved by User  
**Parent:** Post v16 (W1–W4 implemented) + GitHub Readiness Cleanup (`23aa670`)  
**Scope:** End-to-end Self-Aware System Knowledge Registry, Runtime Drift-Proof Introspection, Contextual Prompt Injection, User Configuration Diagnostics & Advisory API, UI System Guide Modal, and Smart Chat Advisory Chips.

**Non-goals (for this cycle):** Provider-specific LLM function/tool-calling loops (adds extra network RTT and breaks smaller local Ollama models), automatic mutation of user settings by the LLM without explicit user confirmation, exposing raw secret keys or `.env` values in snapshots.

---

## 1. Problem Statement & Goals

Currently, [`buildSystemContext`](../../../backend/src/services/chat/systemContext.ts) injects only user-defined prompts, memory notes, attachments, and selected RAG chunks. The assistant has zero built-in awareness of the **LLM Personal Assistant Control Panel** platform, its features, settings, UI locations, or the user's live configuration state.

This design introduces a unified **System Self-Knowledge & Live Advisor** subsystem that satisfies three core requirements:
1. **Complete Feature & Settings Knowledge:** The system knows all of its capabilities, settings, value ranges, supported models/providers, and UI workflows.
2. **Contextual User Guidance:** Both in chat and in the UI, the system understands *how* and *why* each feature/setting should be used and proactively advises the user based on their live state (without leaking secrets).
3. **Self-Updating Knowledge on Code Changes:** Adding or modifying a feature, setting, model capability, limit, or route updates the system's runtime knowledge automatically via shared live constants + runtime schema/route introspection, backed by a Jest/CI contract drift guard.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    Single Source of Truth (Backend)                      │
│  validators / fileMagic / memory limits / modelCapabilities / pricing   │
│                                  │                                      │
│                                  ▼                                      │
│        backend/src/services/systemKnowledge/                            │
│  ┌──────────────┐  ┌──────────────────┐  ┌─────────────┐  ┌──────────┐  │
│  │ registry.ts  │─▶│ introspector.ts  │─▶│ advisor.ts  │  │matcher.ts│  │
│  │ (Cards+Meta) │  │ (Prisma+Routes   │  │ (Snapshot + │  │(Intent   │  │
│  │              │  │  + SHA-256 Hash) │  │  Advisories)│  │ Selector)│  │
│  └──────────────┘  └──────────────────┘  └──────┬──────┘  └────┬─────┘  │
└─────────────────────────────────────────────────┼──────────────┼────────┘
                                                  │              │
                     ┌────────────────────────────┘              │
                     ▼                                           ▼
     GET /api/system/knowledge                     buildSystemContext.ts
     (auth-protected JSON API)                     ├─ Tier 1: Compact Passport + Live State (~160 tok)
                     │                             └─ Tier 2: 1–4 Matched Feature/Setting Cards (on intent/issue)
                     ▼
┌─────────────────────────────────────────┐
│             Frontend UI                 │
│  • Navigation + ChatControls ("🧭 Гід") │
│  • SystemGuideModal (Advisories + Docs) │
│  • SmartAdvisoryBar (1 chip above input)│
│  • Settings.tsx (?tab= deep links)      │
└─────────────────────────────────────────┘
```

---

## 3. Backend Components & Data Contracts

### 3.1 Module Layout (`backend/src/services/systemKnowledge/`)

| File | Responsibility |
|------|----------------|
| `types.ts` | TypeScript interfaces: `KnowledgeCategory`, `KnowledgeCard`, `UserSystemSnapshot`, `AdvisoryTip`, `SystemKnowledgeResponse`. |
| `liveMetadata.ts` | Reads live runtime constants directly from codebase modules (`ALLOWED_PROVIDERS`, `temperature` `0..2`, `max_tokens` `100..32000`, `getMaxUploadBytes()`, `MAX_NOTES`, `MAX_NOTE_CHARS`, `MAX_USER_NOTES`, `SUMMARY_THRESHOLD`, vision rules from `modelCapabilities.ts`, priced models from `tokenCostCalculator.ts`) so numeric/model changes propagate with zero manual edits. |
| `registry.ts` | Structured Ukrainian `KnowledgeCard[]` covering all 7 categories: `providers`, `settings`, `rag`, `memory`, `artifacts`, `chat_tools`, `desktop`. Interpolates live values from `liveMetadata.ts`. |
| `introspector.ts` | Inspects `Prisma.UserSettingsScalarFieldEnum` (excluding internal PK/FK/timestamps) and registered API route domains (`auth`, `chat`, `conversations`, `documents`, `models`, `prompts`, `settings`, `users`, `system`). Synthesizes fallback `KnowledgeCard` entries if a newly added setting or route domain has no explicit card yet, and computes a deterministic `versionHash` (`SHA-256`, 12-char hex prefix) over all cards + live metadata. |
| `advisor.ts` | Builds `UserSystemSnapshot` from Prisma (`UserSettings`, `Document` status/provider counts, `UserPrompt` pinned count, `UserMemoryNote` count, active turn provider/model/selectedDocIds/webSearch) and evaluates deterministic `AdvisoryTip[]`. Never decrypts or returns raw API keys. |
| `matcher.ts` | Scores `KnowledgeCard[]` against the user's message keywords/stems (Ukrainian + English) and active `AdvisoryTip` categories, returning top `1–4` cards only when relevant; also formats Tier 1 (compact passport + live snapshot) and Tier 2 (matched detailed cards) system prompt blocks. |

### 3.2 Core Types (`types.ts`)

```typescript
export type KnowledgeCategory =
  | 'providers'
  | 'settings'
  | 'rag'
  | 'memory'
  | 'artifacts'
  | 'chat_tools'
  | 'desktop';

export interface KnowledgeCard {
  id: string;
  category: KnowledgeCategory;
  title: string;
  summary: string;
  whyUse: string;
  howToUse: string;
  uiPath: string;
  relatedSettings?: string[];
  relatedRoutes?: string[];
  keywords: string[];
  liveFacts: Record<string, string | number | boolean | string[]>;
  autoGenerated?: boolean;
}

export type AdvisoryActionType =
  | 'navigate_settings'
  | 'open_documents'
  | 'open_prompts'
  | 'ask_ai';

export interface AdvisoryTip {
  id: string;
  severity: 'warning' | 'info';
  category: KnowledgeCategory;
  title: string;
  message: string;
  actionLabel: string;
  actionType: AdvisoryActionType;
  actionTarget?: string; // e.g. '/settings?tab=api-keys'
  suggestedPrompt?: string;
}

export interface UserSystemSnapshot {
  activeProvider: string;
  activeModel: string;
  modelSupportsVision: boolean;
  modelSupportsWebSearch: boolean;
  webSearchEnabled: boolean;
  configuredProviders: {
    openai: boolean;
    gemini: boolean;
    anthropic: boolean;
    ollamaHost: string;
  };
  ragEmbeddingMode: 'openai' | 'ollama' | 'fallback';
  documents: {
    total: number;
    ready: number;
    pending: number;
    failed: number;
    needsReindex: number;
    selectedInChat: number;
  };
  hasCustomSystemPrompt: boolean;
  pinnedPromptsCount: number;
  userMemoryNotesCount: number;
  temperature: number;
  maxTokens: number;
}
```

### 3.3 Advisory Rules (`advisor.ts`)

1. **`missing-provider-key` (`warning`):** Active provider is `openai`, `gemini`, or `anthropic`, and neither a per-user encrypted key nor a server env key is configured → Action: `navigate_settings` → `/settings?tab=api-keys`.
2. **`documents-failed` (`warning`):** `documents.failed > 0` → Action: `open_documents`.
3. **`documents-needs-reindex` (`warning`):** `documents.needsReindex > 0` → Action: `open_documents`.
4. **`rag-fallback-mode` (`warning`):** `documents.ready > 0` and `ragEmbeddingMode === 'fallback'` → Explains semantic search limitation and recommends adding an OpenAI key or switching to Ollama (`nomic-embed-text`) → Action: `navigate_settings` → `/settings?tab=api-keys`.
5. **`rag-docs-unselected` (`info`):** `documents.ready > 0` and `documents.selectedInChat === 0` → Reminds user to select documents in `📄 Документи (RAG)` when asking questions about uploaded files → Action: `open_documents`.
6. **`web-search-hint` (`info`):** `activeProvider === 'gemini'` and `!webSearchEnabled` → Mentions the `🌐 Пошук в інтернеті` toggle above the input for real-time facts → Action: `ask_ai`.
7. **`personalization-onboarding` (`info`):** `!hasCustomSystemPrompt && userMemoryNotesCount === 0 && pinnedPromptsCount === 0` → Explains how System Prompt, Prompt Library, and Global User Memory personalize responses → Action: `navigate_settings` → `/settings?tab=memory`.

### 3.4 Two-Tier Prompt Injection (`buildSystemContext` & `prepareMessages`)

In [`prepare.ts`](../../../backend/src/services/chat/prepare.ts) and [`systemContext.ts`](../../../backend/src/services/chat/systemContext.ts):
- Pass `{ activeProvider: input.provider, activeModel: input.model }` in `options` to `buildSystemContext`.
- **Tier 1 (Always Injected, ~160 tokens):**
  - Identifies the assistant as running inside **LLM Personal Assistant Control Panel**.
  - Summarizes core UI capabilities (4 providers, Hybrid RAG vs inline `📎` attachments, Dual-layer Memory, Prompt Library, Export, Interactive Artifacts via ```` ```html ```` / ```` ```svg ```` with `<!-- title: Назва -->`).
  - Includes a compact 4-line summary of `UserSystemSnapshot` (current provider/model, Vision/WebSearch support, RAG mode & doc counts, active warning IDs) and instructs the model to give accurate UI guidance when asked or when a limitation blocks the user's request.
- **Tier 2 (Conditional on Intent or Active Blockers, 1–4 Cards):**
  - Triggered when `matchRelevantKnowledgeCards(userMessage, snapshot, advisories)` detects platform/settings/how-to intent (e.g., questions about settings, keys, RAG, documents, Excel, memory, prompts, models, tokens, cost, artifacts, voice, export, desktop, Ollama, Gemini web search) OR when an active `warning` advisory directly affects the current turn (e.g., RAG enabled while in `fallback` mode or with `needsReindex > 0`).
  - Appends detailed `KnowledgeCard` blocks (`Призначення`, `Як використовувати`, `Шлях в UI`, `Поточні ліміти`) so the assistant answers with exact, up-to-date facts.
- **Resilience:** Wrapped in `try/catch` with `logger.warn`; any failure in snapshot/knowledge assembly degrades gracefully without blocking chat streaming.

### 3.5 HTTP Endpoint (`GET /api/system/knowledge`)

- Route: `backend/src/routes/system.ts` mounted at `/api/system` in [`server.ts`](../../../backend/src/server.ts) behind `auth` middleware.
- Optional query params: `provider`, `model`, `selectedDocCount`, `webSearchEnabled` (so the frontend chat view can request advisories reflecting unsaved live toolbar toggles in the current chat tab).
- Response `200 OK` (`SystemKnowledgeResponse`):
  ```typescript
  export interface SystemKnowledgeResponse {
    versionHash: string;
    generatedAt: string;
    snapshot: UserSystemSnapshot;
    advisories: AdvisoryTip[];
    cards: KnowledgeCard[];
  }
  ```

---

## 4. Self-Updating & Drift-Guard Guarantee

To ensure system knowledge **always updates** when features or settings are added or modified:

1. **Shared Live Constants (`liveMetadata.ts`):** Validator bounds (`MIN_MAX_TOKENS = 100`, `MAX_MAX_TOKENS = 32000`, `MIN_TEMPERATURE = 0`, `MAX_TEMPERATURE = 2` exported from `settingsValidator.ts`), `ALLOWED_PROVIDERS`, memory caps, upload size limits, Vision rules, and pricing model IDs are imported directly — never copy-pasted.
2. **Runtime Schema & Route Introspection (`introspector.ts`):**
   - Reads `Prisma.UserSettingsScalarFieldEnum` and `EXPECTED_ROUTE_DOMAINS` from a central route manifest exported by `backend/src/routes/routeManifest.ts` (used by `server.ts`).
   - If a field or route domain lacks a dedicated `relatedSettings` / `relatedRoutes` mapping in `registry.ts`, `introspector.ts` automatically generates an `autoGenerated: true` card in runtime output and recalculates `versionHash`.
3. **Automated Contract Test (`backend/src/__tests__/systemKnowledgeSync.test.ts`):**
   - Asserts `autoGenerated` cards count is `0` (meaning every single `UserSettings` column in Prisma, every field in `validateSettingsUpdate`, every provider in `ALLOWED_PROVIDERS`, and every mounted route in `routeManifest.ts` has a curated Ukrainian `KnowledgeCard` explaining *what it is, why to use it, and how to use it*).
   - Verifies `versionHash` changes deterministically whenever a card description, limit, provider, or setting changes.
   - Runs automatically on every local `npm test` and in `.github/workflows/ci.yml`.

---

## 5. Frontend UX Components

1. **API & Hook (`frontend/src/services/api/system.ts` + `frontend/src/hooks/useSystemKnowledge.ts`):**
   - `systemAPI.getKnowledge(params)` + React Query hook `useSystemKnowledge(params)` (`queryKeys.systemKnowledge(...)`), automatically invalidated when settings, documents, prompts, or memory notes change.
2. **Deep-Linkable Settings Tabs (`frontend/src/pages/Settings.tsx`):**
   - Reads `?tab=` from `useSearchParams()` (`general` | `api-keys` | `models` | `memory` | `updates`) and syncs tab switches so advisory buttons open the exact target tab immediately.
3. **System Guide & Advisor Modal (`frontend/src/components/system/SystemGuideModal.tsx`):**
   - Triggered from `🧭 Гід` button in [`Navigation.tsx`](../../../frontend/src/components/Navigation.tsx) and quick help button in [`ChatControls.tsx`](../../../frontend/src/components/chat/ChatControls.tsx).
   - Displays a badge count when `warning` advisories exist.
   - **Tab 1 — «Персональні поради»:** Renders live `advisories` + compact readiness summary (Providers, Hybrid RAG status, Memory, Vision/Web Search) with 1-click action buttons (`Відкрити налаштування`, `Відкрити документи`, `Запитати в чаті`).
   - **Tab 2 — «Функції та Налаштування»:** Searchable + category-filtered catalog of all `KnowledgeCard` items showing `Для чого`, `Як використовувати`, `Де знайти в UI`, live limits, and a `Запитати AI про це` action.
   - Footer displays `Версія бази знань: #<versionHash>`.
4. **Smart Contextual Advisory Chip (`frontend/src/components/chat/SmartAdvisoryBar.tsx`):**
   - Rendered above `MessageInput` in [`ChatBoxOptimized.tsx`](../../../frontend/src/components/ChatBoxOptimized.tsx).
   - Shows **at most 1** actionable `warning` (or contextual `info` when relevant to active provider/docs) with a primary action button and a dismiss `×` button persisted in `sessionStorage` keyed by `advisory.id + versionHash`.

---

## 6. Verification & Testing Strategy

- **Backend Unit & Integration Tests:**
  - `systemKnowledgeSync.test.ts`: enforces 100% coverage of Prisma `UserSettings` fields, `ALLOWED_PROVIDERS`, `validateSettingsUpdate` fields, and mounted API routes; verifies `versionHash` reactivity and runtime fallback card synthesis.
  - `systemAdvisor.test.ts`: tests `buildUserSystemSnapshot` (verifying zero secret leakage) and all advisory rules (`missing-provider-key`, `rag-fallback-mode`, `documents-needs-reindex`, `documents-failed`, `web-search-hint`, `personalization-onboarding`).
  - `systemKnowledgeMatcher.test.ts`: verifies Tier 1 compact prompt size and Tier 2 intent matching on Ukrainian & English queries (e.g., `"як увімкнути веб пошук"`, `"навіщо температура і max tokens"`, `"як працює пам'ять"`), while keeping Tier 2 empty on unrelated coding/translation prompts.
  - `systemRoutes.test.ts`: tests `GET /api/system/knowledge` auth protection (`401` without JWT, `200` with payload).
- **Frontend Unit Tests (Vitest):**
  - `SystemGuideModal.test.tsx`: renders advisories, filters/searches knowledge cards, triggers navigation and chat prompt callbacks.
  - `SmartAdvisoryBar.test.tsx`: renders top advisory, executes action, and persists dismissal in `sessionStorage`.
  - `Settings.test.tsx`: verifies `?tab=api-keys` / `?tab=memory` opens the requested tab.
- **End-to-End Verification:**
  - Rebuild Docker stack, verify `GET /api/system/knowledge`, UI Guide modal, Smart Advisory chip, and live AI chat response accurately explaining system features and the user's current settings.

# Google Gemini Integration & Google Search Grounding — Design

**Date:** 2026-10-28  
**Status:** Approved (user Ok)  
**Parent:** v16 AI Capabilities & Providers Expansion  
**Scope:** Native Google Gemini integration (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`) with SSE streaming, multimodal image support, Google Search Grounding with live citations, and encrypted key management.

---

## 1. Problem & Context

Currently, the Personal LLM Assistant supports two chat providers:
1. **OpenAI** (cloud models, requires paid API key).
2. **Ollama** (local models, requires local GPU/compute).

Users want access to **Google Gemini** models to benefit from:
- A generous free tier (Google AI Studio).
- High speed and large context windows (up to 1M+ tokens in Gemini 1.5/2.0).
- Multimodal capabilities (vision/image understanding).
- Live web search grounding via Google Search with source citations.

---

## 2. User Decisions (Brainstorming)

| Decision | Choice | Details |
|----------|--------|---------|
| Priority Feature | **Google Gemini (Option 1)** | First step in expanding AI capabilities |
| Scope & Capabilities | **Full Package (Option 1)** | SSE streaming + Multimodal (Vision) + Google Search Grounding with web source citations + encrypted API key management |
| Architectural Approach | **Official Google Gen AI SDK (Approach 1)** | Native `@google/genai` integration with dedicated `geminiService.ts` adapter, preventing coupling with OpenAI client |
| Grounding UI Control | **Toggle in Composer (`MessageInput`)** | Dedicated `🌐` button next to Vision (`🖼️`) and Attachments (`📎`), active when provider is Gemini |
| Secret Management | **AES-256-GCM (`UserSettings`)** | `gemini_api_key_enc` in database with fallback to `process.env.GEMINI_API_KEY` |

---

## 3. Goals

1. **Native Gemini Provider:** Support `gemini-2.0-flash` (default), `gemini-1.5-flash`, and `gemini-1.5-pro` in `ProviderFactory`.
2. **SSE Streaming:** Token-by-token streaming compatible with the existing frontend `useChatStream` and abort/stop flow.
3. **Multimodal Support (Vision):** Pass image attachments seamlessly as `inlineData` to Gemini models.
4. **Google Search Grounding:** Optional web search grounding (`googleSearch: {}`); map `groundingMetadata` into structured `RagSource` records stored in `Message.sources`.
5. **Key Security:** Encrypt user API keys at rest in PostgreSQL using AES-256-GCM (`secretCrypto.ts`); support environment variable fallback.
6. **Frontend Experience:** Provider and model pickers in `ChatControls`, dedicated search grounding button in `MessageInput`, web citation links in `MessageSources`, and key settings in `Settings.tsx`.
7. **Reliability & Tests:** Comprehensive unit tests for services, settings, and UI components; zero regressions for OpenAI and Ollama.

---

## 4. Non-goals

- Adding Anthropic Claude or generic OpenAI endpoints in this wave (deferred to subsequent v16 sub-phases).
- Using Gemini for RAG embeddings (existing OpenAI 768-d and Ollama `nomic-embed-text` remain authoritative).
- Autonomous multi-turn function calling beyond Google Search grounding (arbitrary code execution tools deferred).
- Modifying database schema for message storage (`Message.sources` already supports arbitrary source payloads).

---

## 5. Architecture & Data Flow

```
User Prompt (+ Image / + Web Search Toggle)
                     │
                     ▼
           Frontend (ChatBoxOptimized)
                     │
       POST /api/chat/stream (SSE)
                     │
                     ▼
             chatController
                     │
                     ▼
                ChatService
                     │
    ┌────────────────┴────────────────┐
    ▼                                 ▼
prepareMessages              buildSystemContext
(resolve Gemini key               (RAG docs +
 & user image)                     Memory notes)
    │                                 │
    └────────────────┬────────────────┘
                     ▼
              ProviderFactory
                     │
                     ▼
        geminiService.streamGeminiMessage
                     │
             @google/genai SDK
  (contents + systemInstruction + tools: [googleSearch])
                     │
       ┌─────────────┴─────────────┐
       ▼                           ▼
 SSE Stream Tokens         Grounding Metadata
 (onChunk -> client)       (web links -> RagSource[])
       │                           │
       └─────────────┬─────────────┘
                     ▼
         ChatService.persistTurn
       (Message saved with sources)
```

### 5.1 Database Schema (`backend/prisma/schema.prisma`)

Add `geminiApiKeyEnc` to `UserSettings`:
```prisma
model UserSettings {
  id                  Int      @id @default(autoincrement())
  userId              Int      @unique @map("user_id")
  defaultModel        String   @default("gpt-3.5-turbo") @map("default_model") @db.VarChar(255)
  defaultProvider     String   @default("openai") @map("default_provider") @db.VarChar(50)
  defaultOllamaHost   String?  @default("http://127.0.0.1:11434/v1/chat/completions") @map("default_ollama_host") @db.VarChar(255)
  temperature         Decimal  @default(0.7) @db.Decimal(3, 2)
  maxTokens           Int      @default(2000) @map("max_tokens")
  systemPrompt        String   @default("") @map("system_prompt") @db.Text
  openaiApiKeyEnc     String?  @map("openai_api_key_enc") @db.Text
  geminiApiKeyEnc     String?  @map("gemini_api_key_enc") @db.Text
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @default(now()) @updatedAt @map("updated_at")

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId], map: "idx_user_settings_user_id")
  @@map("user_settings")
}
```

Prisma migration: `add_gemini_api_key_to_user_settings`.

### 5.2 Key Resolution (`backend/src/utils/geminiKeyResolver.ts`)

```typescript
export async function resolveGeminiApiKey(userId: number): Promise<string | null> {
  const row = await prisma.userSettings.findUnique({
    where: { userId },
    select: { geminiApiKeyEnc: true },
  });
  if (row?.geminiApiKeyEnc) {
    return decryptSecret(row.geminiApiKeyEnc);
  }
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return null;
}
```

### 5.3 Gemini Service Adapter (`backend/src/services/geminiService.ts`)

- **SDK:** `@google/genai` (`GoogleGenAI`).
- **Message Mapping:**
  - System messages extracted from context array and supplied to `config.systemInstruction`.
  - Roles mapped: `'user'` → `'user'`, `'assistant'` → `'model'`.
  - Images converted from data URL (`data:image/...;base64,...`) to `{ inlineData: { mimeType, data } }`.
- **Google Search Grounding:**
  - If `options.enableWebSearch === true`, pass `tools: [{ googleSearch: {} }]`.
  - Extract `groundingChunks` from `candidate.groundingMetadata`.
  - Format as `RagSource`:
    ```typescript
    {
      id: `web-${idx}`,
      document_id: 0,
      filename: chunk.web?.title || new URL(chunk.web?.uri).hostname,
      chunk_index: idx,
      snippet: chunk.web?.title || chunk.web?.uri,
      url: chunk.web?.uri,
      score: 1.0,
      source_type: 'web_search',
    }
    ```
- **Streaming:**
  - Invoke `ai.models.generateContentStream({ model, contents, config })`.
  - Push tokens via `onChunk(text)`.
  - Handle `options.signal` aborts gracefully.

### 5.4 ProviderFactory Registration

Register `gemini` in `backend/src/services/providerFactory.ts`:
```typescript
gemini: {
  send: geminiService.sendGeminiMessage as SendFn,
  stream: geminiService.streamGeminiMessage as StreamFn,
}
```

---

## 6. Frontend & UI/UX

### 6.1 Chat Toolbar (`frontend/src/components/chat/ChatControls.tsx`)
- Add Gemini provider option:
  ```tsx
  <option value="gemini">✨ Google Gemini</option>
  ```
- Default catalog models for Gemini:
  - `gemini-2.0-flash` (Default)
  - `gemini-1.5-flash`
  - `gemini-1.5-pro`

### 6.2 Composer Web Search Toggle (`frontend/src/components/chat/MessageInput.tsx`)
- Add toggle button:
  ```tsx
  <Button
    type="button"
    variant={webSearchEnabled ? 'primary' : 'outline-secondary'}
    onClick={onToggleWebSearch}
    disabled={streaming || selectedProvider !== 'gemini'}
    title={
      selectedProvider === 'gemini'
        ? (webSearchEnabled ? 'Вимкнути веб-пошук' : 'Увімкнути веб-пошук (Google Search Grounding)')
        : 'Веб-пошук доступний для Google Gemini'
    }
    aria-label="Перемикач пошуку в інтернеті"
    className="py-3 px-3"
  >
    🌐
  </Button>
  ```

### 6.3 Web Source Links (`frontend/src/components/chat/MessageSources.tsx`)
- When source has `url` or `source_type === 'web_search'`:
  - Render icon `🌐`, web title, and clickable link opening in a new tab (`target="_blank" rel="noopener noreferrer"`).

### 6.4 Settings UI (`frontend/src/pages/Settings.tsx`)
- Add `GeminiSettingsCard`:
  - Key input with mask / password toggle.
  - Buttons: «Зберегти» / «Видалити».
  - Status badge: `Ключ налаштовано` (success) vs `Ключ не встановлено` (warning).
  - Link to Google AI Studio: `https://aistudio.google.com/apikey`.

---

## 7. Error Handling

1. **Missing Key:**
   - ChatError `400`: *"Google Gemini API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env."*
   - UI surfaces error with quick action: «Перевірити налаштування».
2. **Quota / Rate Limits (429 RESOURCE_EXHAUSTED):**
   - Mapped to user-friendly message: *"Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель."*
3. **Safety Blocks:**
   - If blocked by safety filters, emit informative text without crashing the SSE stream.
4. **Stream Abort:**
   - Aborting generation persists partial assistant text and cleans up resources cleanly.

---

## 8. Testing & Verification

1. **Backend Unit Tests:**
   - `geminiService.test.ts`: contents/systemInstruction transformation, multimodal image parts, groundingMetadata extraction to `RagSource`, error handling.
   - `geminiKeyResolver.test.ts`: DB key resolution, fallback to env, null when absent.
   - `settingsService.test.ts`: encryption/decryption of `geminiApiKeyEnc`, clear key, public DTO.
   - `providerFactory.test.ts`: gemini dispatching.
   - `modelCapabilities.test.ts`: vision capability verification for `gemini-*`.
2. **Frontend Component Tests:**
   - `ChatControls.test.jsx`: provider selection & Gemini models list.
   - `MessageInput.test.jsx`: web search button toggle state.
   - `MessageSources.test.tsx`: web links rendering with target/rel attributes.
   - `Settings.test.tsx`: Gemini key update and clear actions.
3. **CI / E2E:**
   - Existing E2E specs pass without regression.
   - E2E tests requiring live Gemini skip gracefully if `GEMINI_API_KEY` is not present in CI environment.

# Google Gemini Integration & Search Grounding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Google Gemini (`gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro`) as an official first-class chat provider with SSE streaming, multimodal image support (Vision), Google Search Grounding with web citations, and encrypted API key management in UserSettings.

**Architecture:** A native `@google/genai` client adapter in `geminiService.ts` registered in `ProviderFactory`. User API keys are stored encrypted via AES-256-GCM in PostgreSQL (`UserSettings.geminiApiKeyEnc`) with fallback to `process.env.GEMINI_API_KEY`. The frontend gains Gemini options in `ChatControls`, a `🌐` web search toggle in `MessageInput`, and clickable web citation badges in `MessageSources`.

**Tech Stack:** Express, TypeScript, Prisma 7, PostgreSQL (`pgvector`), `@google/genai`, React 18, Vite 8, React-Bootstrap, Jest, Vitest.

## Global Constraints

- Backend package manager is `npm`.
- Do not introduce breaking changes to existing OpenAI or Ollama providers.
- Maintain existing test coverage: all existing tests in backend, frontend, and desktop must remain green.
- Code style: strict TypeScript, ESLint clean with zero warnings/errors.
- Never log raw API key material; mask keys in all public API responses.
- In `MessageSources`, all external links must have `target="_blank"` and `rel="noopener noreferrer"`.

---

### Task 1: Database Schema & Key Encryption Foundation

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/src/utils/geminiKeyResolver.ts`
- Modify: `backend/src/services/settingsService.ts`
- Test: `backend/src/__tests__/geminiKeyResolver.test.ts`
- Test: `backend/src/__tests__/settingsService.test.ts`

**Interfaces:**
- Consumes: `encryptSecret`, `decryptSecret` from `backend/src/utils/secretCrypto.ts`
- Produces: `resolveGeminiApiKey(userId: number): Promise<string | null>` in `geminiKeyResolver.ts`
- Extends: `toPublicSettingsAsync` with `has_gemini_api_key: boolean`, `UpdateSettingsBody` with `gemini_api_key?: string` and `clear_gemini_api_key?: boolean`

- [ ] **Step 1: Write the failing unit tests for `geminiKeyResolver` and settings updates**

Create `backend/src/__tests__/geminiKeyResolver.test.ts`:
```typescript
import { resolveGeminiApiKey } from '../utils/geminiKeyResolver';
import prisma from '../config/prisma';
import { encryptSecret } from '../utils/secretCrypto';

jest.mock('../config/prisma', () => ({
  userSettings: {
    findUnique: jest.fn(),
  },
}));

describe('geminiKeyResolver', () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
    process.env.GEMINI_API_KEY = originalEnv;
    jest.clearAllMocks();
  });

  it('returns decrypted key from database when present', async () => {
    const rawKey = 'AIzaSyTestKey12345';
    const encrypted = encryptSecret(rawKey);
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: encrypted,
    });

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe(rawKey);
  });

  it('falls back to GEMINI_API_KEY from env when db has no key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue(null);
    process.env.GEMINI_API_KEY = 'env-gemini-key-999';

    const key = await resolveGeminiApiKey(1);
    expect(key).toBe('env-gemini-key-999');
  });

  it('returns null when neither db nor env has a key', async () => {
    (prisma.userSettings.findUnique as jest.Mock).mockResolvedValue({
      geminiApiKeyEnc: null,
    });
    delete process.env.GEMINI_API_KEY;

    const key = await resolveGeminiApiKey(1);
    expect(key).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- src/__tests__/geminiKeyResolver.test.ts`
Expected: FAIL (Cannot find module '../utils/geminiKeyResolver')

- [ ] **Step 3: Update Prisma schema and generate client**

In `backend/prisma/schema.prisma`, add `geminiApiKeyEnc` to `model UserSettings`:
```prisma
  openaiApiKeyEnc     String?  @map("openai_api_key_enc") @db.Text
  geminiApiKeyEnc     String?  @map("gemini_api_key_enc") @db.Text
```

Generate Prisma client:
Run: `npm run prisma:generate --prefix backend`

- [ ] **Step 4: Implement `geminiKeyResolver.ts` and update `settingsService.ts`**

Create `backend/src/utils/geminiKeyResolver.ts`:
```typescript
import prisma from '../config/prisma';
import { decryptSecret } from './secretCrypto';

export async function resolveGeminiApiKey(userId: number): Promise<string | null> {
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId },
      select: { geminiApiKeyEnc: true },
    });
    if (row?.geminiApiKeyEnc && row.geminiApiKeyEnc.trim().length > 0) {
      return decryptSecret(row.geminiApiKeyEnc);
    }
  } catch {
    // If decryption fails or DB unreachable, fall through to env
  }

  const envKey = process.env.GEMINI_API_KEY;
  if (typeof envKey === 'string' && envKey.trim().length > 0) {
    return envKey.trim();
  }
  return null;
}
```

In `backend/src/services/settingsService.ts`:
1. Add `gemini_api_key?: string;` and `clear_gemini_api_key?: boolean;` to `UpdateSettingsBody`.
2. Add `has_gemini_api_key: boolean;` to `defaultSettings()` (default: `false`) and `toPublicSettingsAsync`.
3. In `updateSettings`: handle `gemini_api_key` (encrypt and store in `geminiApiKeyEnc`) and `clear_gemini_api_key` (set `geminiApiKeyEnc: null`).

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix backend -- src/__tests__/geminiKeyResolver.test.ts src/__tests__/settingsService.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/src/utils/geminiKeyResolver.ts backend/src/services/settingsService.ts backend/src/__tests__/geminiKeyResolver.test.ts
git commit -m "feat(be): add geminiApiKeyEnc to UserSettings and geminiKeyResolver"
```

---

### Task 2: Model Capabilities & Catalog Defaults for Gemini

**Files:**
- Modify: `backend/src/utils/modelCapabilities.ts`
- Modify: `backend/src/services/modelsService.ts`
- Test: `backend/src/__tests__/modelCapabilities.test.ts`

**Interfaces:**
- Consumes: model identifiers (e.g. `'gemini-2.0-flash'`, `'gemini-1.5-flash'`)
- Produces: `modelSupportsVision(modelId: string): boolean` returning `true` for all Gemini models
- Extends: `modelsService.listForUser` default models to include Gemini options

- [ ] **Step 1: Write the failing test for Gemini vision capabilities**

Add to `backend/src/__tests__/modelCapabilities.test.ts`:
```typescript
it('recognizes gemini models as supporting vision', () => {
  expect(modelSupportsVision('gemini-2.0-flash')).toBe(true);
  expect(modelSupportsVision('gemini-1.5-flash')).toBe(true);
  expect(modelSupportsVision('gemini-1.5-pro')).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- src/__tests__/modelCapabilities.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `modelCapabilities.ts` and `modelsService.ts`**

In `backend/src/utils/modelCapabilities.ts`:
Update `modelSupportsVision` to match `gemini`:
```typescript
export function modelSupportsVision(modelId?: string | null): boolean {
  if (!modelId) return false;
  const m = modelId.toLowerCase();
  if (m.startsWith('gemini-')) return true;
  return (
    m.includes('vision') ||
    m.includes('gpt-4o') ||
    m.includes('gpt-4-turbo') ||
    m.includes('llava')
  );
}
```

In `backend/src/services/modelsService.ts`:
Include default Gemini models in seed/defaults list:
- `name: 'Gemini 2.0 Flash'`, `modelId: 'gemini-2.0-flash'`, `provider: 'gemini'`, `maxTokens: 4000`, `temperature: 0.7`
- `name: 'Gemini 1.5 Flash'`, `modelId: 'gemini-1.5-flash'`, `provider: 'gemini'`, `maxTokens: 4000`, `temperature: 0.7`
- `name: 'Gemini 1.5 Pro'`, `modelId: 'gemini-1.5-pro'`, `provider: 'gemini'`, `maxTokens: 4000`, `temperature: 0.7`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- src/__tests__/modelCapabilities.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/modelCapabilities.ts backend/src/services/modelsService.ts
git commit -m "feat(be): support Gemini vision in modelCapabilities and catalog"
```

---

### Task 3: Gemini Service Adapter with Streaming, Vision & Google Search Grounding

**Files:**
- Modify: `backend/package.json`
- Create: `backend/src/services/geminiService.ts`
- Modify: `backend/src/services/providerFactory.ts`
- Test: `backend/src/__tests__/geminiService.test.ts`
- Test: `backend/src/__tests__/providerFactory.test.ts`

**Interfaces:**
- Consumes: `@google/genai` package, `ChatMessage[]`, `ProviderOptions`
- Produces: `sendGeminiMessage` and `streamGeminiMessage` matching `ProviderHandlers`
- Registers: `gemini` in `ProviderFactory.providers`

- [ ] **Step 1: Write failing unit test for `geminiService`**

Create `backend/src/__tests__/geminiService.test.ts`:
```typescript
import geminiService from '../services/geminiService';

describe('geminiService', () => {
  it('throws ChatError 400 when API key is missing', async () => {
    await expect(
      geminiService.sendGeminiMessage([{ role: 'user', content: 'Hello' }], 'gemini-2.0-flash', {})
    ).rejects.toThrow('Google Gemini API key не налаштовано');
  });

  it('transforms messages correctly and formats grounding metadata into RagSource', () => {
    const rawChunks = [
      {
        web: {
          uri: 'https://example.com/article',
          title: 'Example Article',
        },
      },
    ];
    const sources = geminiService.formatGroundingSources(rawChunks);
    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      filename: 'Example Article',
      url: 'https://example.com/article',
      source_type: 'web_search',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- src/__tests__/geminiService.test.ts`
Expected: FAIL (Cannot find module '../services/geminiService')

- [ ] **Step 3: Install `@google/genai` dependency**

Run: `npm install --prefix backend @google/genai`

- [ ] **Step 4: Implement `geminiService.ts` and register in `ProviderFactory`**

Create `backend/src/services/geminiService.ts`:
```typescript
import { GoogleGenAI } from '@google/genai';
import logger from '../logger';
import { ChatError } from './chat/types';
import type { RagSource } from './chat/types';

export type GeminiMessagePart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiMessagePart[];
};

export function formatGroundingSources(chunks?: Array<{ web?: { uri?: string; title?: string } }>): RagSource[] {
  if (!Array.isArray(chunks)) return [];
  const results: RagSource[] = [];
  chunks.forEach((chunk, idx) => {
    if (chunk.web?.uri) {
      const uri = chunk.web.uri;
      const title = chunk.web.title || new URL(uri).hostname;
      results.push({
        id: `web-${idx}`,
        document_id: 0,
        filename: title,
        chunk_index: idx,
        snippet: title,
        url: uri,
        score: 1.0,
        source_type: 'web_search',
      });
    }
  });
  return results;
}

export function buildGeminiPayload(
  messages: Array<{ role: string; content?: unknown }>,
  options: Record<string, unknown> = {}
) {
  let systemInstructionText = '';
  const contents: GeminiContent[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      if (typeof msg.content === 'string') {
        systemInstructionText += (systemInstructionText ? '\n\n' : '') + msg.content;
      }
      continue;
    }

    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    const parts: GeminiMessagePart[] = [];

    if (typeof msg.content === 'string') {
      parts.push({ text: msg.content });
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content as Array<{ type?: string; text?: string; image_url?: { url?: string } }>) {
        if (part.type === 'text' && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: {
                mimeType: match[1],
                data: match[2],
              },
            });
          }
        }
      }
    }

    if (parts.length > 0) {
      contents.push({ role, parts });
    }
  }

  const enableWebSearch = options.enableWebSearch === true;
  const config: Record<string, unknown> = {
    temperature: typeof options.temperature === 'number' ? options.temperature : 0.7,
    maxOutputTokens: typeof options.max_tokens === 'number' ? options.max_tokens : 2000,
  };

  if (systemInstructionText.trim().length > 0) {
    config.systemInstruction = { parts: [{ text: systemInstructionText.trim() }] };
  }

  if (enableWebSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  return { contents, config };
}

async function sendGeminiMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'gemini-2.0-flash',
  options: Record<string, unknown> = {}
) {
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : null;
  if (!apiKey) {
    throw new ChatError(
      400,
      'Google Gemini API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const { contents, config } = buildGeminiPayload(messages, options);

  try {
    const response = await ai.models.generateContent({
      model,
      contents: contents as any,
      config: config as any,
    });

    const text = response.text || '';
    const groundingChunks = (response.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
    const sources = formatGroundingSources(groundingChunks);

    return { content: text, sources, model };
  } catch (error: any) {
    logger.error(`Gemini send error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
    }
    throw new ChatError(500, `Помилка Gemini API: ${error?.message || 'Невідома помилка'}`);
  }
}

async function streamGeminiMessage(
  messages: Array<{ role: string; content?: unknown }>,
  model = 'gemini-2.0-flash',
  options: Record<string, unknown> = {},
  onChunk?: (token: string) => void
) {
  const apiKey = typeof options.apiKey === 'string' ? options.apiKey.trim() : null;
  if (!apiKey) {
    throw new ChatError(
      400,
      'Google Gemini API key не налаштовано. Будь ласка, додайте ключ у Налаштуваннях або у файлі .env.'
    );
  }

  const ai = new GoogleGenAI({ apiKey });
  const { contents, config } = buildGeminiPayload(messages, options);

  try {
    const responseStream = await ai.models.generateContentStream({
      model,
      contents: contents as any,
      config: config as any,
    });

    let fullText = '';
    let finalGroundingChunks: any[] = [];

    for await (const chunk of responseStream) {
      const chunkText = chunk.text || '';
      if (chunkText) {
        fullText += chunkText;
        if (onChunk) onChunk(chunkText);
      }
      const chunks = (chunk.candidates?.[0] as any)?.groundingMetadata?.groundingChunks;
      if (Array.isArray(chunks) && chunks.length > 0) {
        finalGroundingChunks = chunks;
      }
    }

    const sources = formatGroundingSources(finalGroundingChunks);
    return { content: fullText, sources, model };
  } catch (error: any) {
    logger.error(`Gemini stream error: ${error?.message || error}`);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      throw new ChatError(429, 'Перевищено ліміт запитів Gemini API. Будь ласка, зачекайте або спробуйте іншу модель.');
    }
    throw new ChatError(500, `Помилка стрімінгу Gemini: ${error?.message || 'Невідома помилка'}`);
  }
}

export default {
  sendGeminiMessage,
  streamGeminiMessage,
  formatGroundingSources,
  buildGeminiPayload,
};
```

In `backend/src/services/providerFactory.ts`:
Add `gemini` to `providers`:
```typescript
import geminiService from './geminiService';

// In ProviderFactory.providers:
gemini: {
  send: geminiService.sendGeminiMessage as SendFn,
  stream: geminiService.streamGeminiMessage as StreamFn,
},
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --prefix backend -- src/__tests__/geminiService.test.ts src/__tests__/providerFactory.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/src/services/geminiService.ts backend/src/services/providerFactory.ts backend/src/__tests__/geminiService.test.ts
git commit -m "feat(be): add geminiService adapter with streaming, vision, and grounding"
```

---

### Task 4: Chat Preparation & Controller Wiring

**Files:**
- Modify: `backend/src/services/chat/prepare.ts`
- Modify: `backend/src/controllers/chatController.ts`
- Test: `backend/src/__tests__/chatHttpHelpers.test.ts`

**Interfaces:**
- Consumes: `resolveGeminiApiKey(userId)`
- Produces: Populated `options.apiKey` when `provider === 'gemini'` and preservation of `options.enableWebSearch`

- [ ] **Step 1: Write failing test for Gemini key resolution in chat preparation**

Add test to `backend/src/__tests__/chatHttpHelpers.test.ts`:
Verify that `prepareMessages` resolves the Gemini key when `provider === 'gemini'`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix backend -- src/__tests__/chatHttpHelpers.test.ts`
Expected: FAIL

- [ ] **Step 3: Update `backend/src/services/chat/prepare.ts`**

Import `resolveGeminiApiKey`:
```typescript
import { resolveGeminiApiKey } from '../../utils/geminiKeyResolver';
```

In `prepareMessages`:
```typescript
  if (input.provider === 'gemini') {
    const geminiKey = await resolveGeminiApiKey(input.userId);
    if (geminiKey) {
      options.apiKey = geminiKey;
    }
  } else {
    const openaiKey = await resolveOpenAiApiKey(input.userId);
    if (openaiKey) {
      options.apiKey = openaiKey;
    }
  }

  if (input.options?.enableWebSearch === true) {
    options.enableWebSearch = true;
  }
```

In `backend/src/controllers/chatController.ts`:
Ensure `enableWebSearch` in request body is passed into `options`.
Ensure sources returned from `geminiService` are combined with `prepared.sources` when saving the turn.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test --prefix backend -- src/__tests__/chatHttpHelpers.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/chat/prepare.ts backend/src/controllers/chatController.ts
git commit -m "feat(be): resolve Gemini API key and propagate enableWebSearch in chat prepare"
```

---

### Task 5: Frontend Settings & Key Management

**Files:**
- Modify: `frontend/src/types/api.ts`
- Create: `frontend/src/components/settings/GeminiSettingsCard.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Test: `frontend/src/components/settings/GeminiSettingsCard.test.tsx`
- Test: `frontend/src/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `useSettings()` query & mutation
- Produces: UI card for managing Gemini API Key

- [ ] **Step 1: Write the failing test for `GeminiSettingsCard`**

Create `frontend/src/components/settings/GeminiSettingsCard.test.tsx`:
```tsx
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GeminiSettingsCard from './GeminiSettingsCard';

describe('GeminiSettingsCard', () => {
  it('renders status and can submit new key', () => {
    const onSave = vi.fn();
    const onClear = vi.fn();
    render(
      <GeminiSettingsCard
        hasKey={false}
        saving={false}
        onSaveKey={onSave}
        onClearKey={onClear}
      />
    );

    expect(screen.getByText(/Google Gemini/i)).toBeInTheDocument();
    expect(screen.getByText(/Ключ не встановлено/i)).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Введіть Gemini API ключ/i);
    fireEvent.change(input, { target: { value: 'AIzaSy123456789' } });
    fireEvent.click(screen.getByRole('button', { name: /Зберегти/i }));

    expect(onSave).toHaveBeenCalledWith('AIzaSy123456789');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix frontend -- src/components/settings/GeminiSettingsCard.test.tsx`
Expected: FAIL (Cannot find module)

- [ ] **Step 3: Update `frontend/src/types/api.ts` and implement `GeminiSettingsCard.tsx`**

In `frontend/src/types/api.ts`, add `has_gemini_api_key?: boolean;` to `UserSettings`.

Create `frontend/src/components/settings/GeminiSettingsCard.tsx`:
```tsx
import React, { useState } from 'react';
import { Card, Form, Button, Badge } from 'react-bootstrap';

export type GeminiSettingsCardProps = {
  hasKey: boolean;
  saving: boolean;
  onSaveKey: (key: string) => void;
  onClearKey: () => void;
};

export default function GeminiSettingsCard({
  hasKey,
  saving,
  onSaveKey,
  onClearKey,
}: GeminiSettingsCardProps) {
  const [keyInput, setKeyInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (keyInput.trim()) {
      onSaveKey(keyInput.trim());
      setKeyInput('');
    }
  };

  return (
    <Card className="bg-dark text-light border-secondary mb-4 shadow-sm">
      <Card.Header className="d-flex justify-content-between align-items-center border-secondary">
        <h5 className="mb-0">✨ Google Gemini API Key</h5>
        <Badge bg={hasKey ? 'success' : 'warning'} className="text-dark">
          {hasKey ? 'Ключ налаштовано' : 'Ключ не встановлено'}
        </Badge>
      </Card.Header>
      <Card.Body>
        <p className="text-muted small">
          Отримайте безкоштовний API-ключ у{' '}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="text-info"
          >
            Google AI Studio
          </a>
          . Ключ надійно шифрується на сервері.
        </p>

        <Form onSubmit={handleSubmit}>
          <Form.Group className="mb-3">
            <Form.Control
              type="password"
              placeholder="Введіть Gemini API ключ (AIzaSy...)"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              disabled={saving}
              className="bg-dark text-light border-secondary"
            />
          </Form.Group>
          <div className="d-flex gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={saving || !keyInput.trim()}
            >
              {saving ? 'Збереження...' : 'Зберегти ключ'}
            </Button>
            {hasKey && (
              <Button
                type="button"
                variant="outline-danger"
                disabled={saving}
                onClick={onClearKey}
              >
                Видалити ключ
              </Button>
            )}
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
}
```

In `frontend/src/pages/Settings.tsx`:
Mount `GeminiSettingsCard` alongside OpenAI settings card.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --prefix frontend -- src/components/settings/GeminiSettingsCard.test.tsx src/pages/Settings.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types/api.ts frontend/src/components/settings/GeminiSettingsCard.tsx frontend/src/pages/Settings.tsx frontend/src/components/settings/GeminiSettingsCard.test.tsx
git commit -m "feat(fe): add GeminiSettingsCard and wire into Settings page"
```

---

### Task 6: Frontend Chat Controls, Search Grounding Button & Source Links

**Files:**
- Modify: `frontend/src/components/chat/ChatControls.tsx`
- Modify: `frontend/src/components/chat/MessageInput.tsx`
- Modify: `frontend/src/components/chat/MessageSources.tsx`
- Modify: `frontend/src/hooks/useChatStream.ts`
- Modify: `frontend/src/utils/catalogModelOptions.ts`
- Test: `frontend/src/components/chat/ChatControls.test.jsx`
- Test: `frontend/src/components/chat/MessageInput.test.jsx`
- Test: `frontend/src/components/chat/MessageSources.test.tsx`

**Interfaces:**
- Produces: `webSearchEnabled` toggle in `MessageInput`, `✨ Google Gemini` option in `ChatControls`, clickable external URLs in `MessageSources`

- [ ] **Step 1: Write failing tests for UI components**

Update `frontend/src/components/chat/MessageSources.test.tsx` to test external link rendering:
```tsx
it('renders web search sources as external links with noopener', () => {
  const sources = [
    {
      id: 'web-0',
      document_id: 0,
      filename: 'Google Cloud Documentation',
      chunk_index: 0,
      snippet: 'Google Cloud Documentation',
      url: 'https://cloud.google.com/docs',
      score: 1.0,
      source_type: 'web_search',
    },
  ];
  render(<MessageSources sources={sources} />);
  const link = screen.getByRole('link', { name: /Google Cloud Documentation/i });
  expect(link).toHaveAttribute('href', 'https://cloud.google.com/docs');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noopener noreferrer');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --prefix frontend -- src/components/chat/MessageSources.test.tsx`
Expected: FAIL

- [ ] **Step 3: Update `ChatControls.tsx`**

In `frontend/src/components/chat/ChatControls.tsx`:
Add option:
```tsx
<option value="gemini">✨ Google Gemini</option>
```

In `frontend/src/utils/catalogModelOptions.ts`:
Add default options for Gemini models when `provider === 'gemini'`.

- [ ] **Step 4: Update `MessageInput.tsx` and `useChatStream.ts`**

In `frontend/src/components/chat/MessageInput.tsx`:
Add props: `webSearchEnabled?: boolean`, `onToggleWebSearch?: () => void`, `isGeminiProvider?: boolean`.
Render button `🌐`:
```tsx
<Button
  type="button"
  variant={webSearchEnabled ? 'primary' : 'outline-secondary'}
  onClick={onToggleWebSearch}
  disabled={streaming || !isGeminiProvider}
  title={
    isGeminiProvider
      ? (webSearchEnabled ? 'Вимкнути веб-пошук' : 'Увімкнути веб-пошук (Google Search Grounding)')
      : 'Веб-пошук доступний для Google Gemini'
  }
  aria-label="Перемикач пошуку в інтернеті"
  className="py-3 px-3"
>
  🌐
</Button>
```

In `frontend/src/hooks/useChatStream.ts`:
Accept `enableWebSearch: boolean` in `sendMessage` parameters and include in request body.

- [ ] **Step 5: Update `MessageSources.tsx`**

In `frontend/src/components/chat/MessageSources.tsx`:
If item has `url` property:
```tsx
<a
  href={source.url}
  target="_blank"
  rel="noopener noreferrer"
  className="badge bg-primary text-decoration-none d-inline-flex align-items-center gap-1"
>
  🌐 {source.filename || source.url}
</a>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test --prefix frontend -- src/components/chat/MessageSources.test.tsx src/components/chat/ChatControls.test.jsx src/components/chat/MessageInput.test.jsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/chat/ChatControls.tsx frontend/src/components/chat/MessageInput.tsx frontend/src/components/chat/MessageSources.tsx frontend/src/hooks/useChatStream.ts frontend/src/utils/catalogModelOptions.ts
git commit -m "feat(fe): add Gemini chat controls, web search toggle, and external source citations"
```

---

### Task 7: End-to-End Verification & Documentation

**Files:**
- Modify: `README.md`
- Modify: `backend/.env.example`
- Verify: Full test suites across backend, frontend, desktop

- [ ] **Step 1: Update documentation**

In `backend/.env.example` and `README.md`:
Add `GEMINI_API_KEY` description and explain how Google Search Grounding works.

- [ ] **Step 2: Run all linters and typechecks**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Run: `npm run lint --prefix frontend`
Run: `npm run build --prefix frontend`
Run: `npm test --prefix desktop`

- [ ] **Step 3: Run all unit test suites**

Run: `npm test --prefix frontend`
Run: `npm test --prefix backend -- --testPathIgnorePatterns="health|conversations|documents"`

- [ ] **Step 4: Commit**

```bash
git add README.md backend/.env.example
git commit -m "docs: document Google Gemini integration, environment variables, and grounding"
```

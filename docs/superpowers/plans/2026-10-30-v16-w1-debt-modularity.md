# v16 Wave 1 — Technical Debt, Modularity & Security Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean technical debt and modularize frontend/backend by decomposing `Settings.tsx` into a tabbed layout, aligning React 18 type definitions to remove `--legacy-peer-deps` across npm and CI, enabling React Router v7 future flags, and replacing vulnerable SheetJS `xlsx` with modern `exceljs`.

**Architecture:**
Decompose the monolithic `Settings.tsx` page into focused sub-tab components using React-Bootstrap Tabs. Update `frontend/package.json` to lock `@types/react` and `@types/react-dom` to the `~18.3.x` line, allowing removal of `--legacy-peer-deps` in npm scripts and CI. Configure React Router v7 future flags in `App.tsx` and test wrappers to eliminate console transition warnings. Replace backend `xlsx` parser in `extraction.ts` and `sheetContext.ts` with asynchronous `exceljs.Workbook` reading, clearing all known GHSA advisories from `security-audit-baseline.md`.

**Tech Stack:** React 18, React-Bootstrap, React Router v6, TypeScript, Vite 8, Express, ExcelJS, Jest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-30-project-evolution-roadmap-v16-design.md` §3

## Global Constraints

- Do not break existing settings persistence or API contracts (`GET /api/settings`, `PUT /api/settings`).
- Do not introduce breaking React Router v7 major upgrades; configure v7 flags within v6.
- All existing tests in backend (`npm test --prefix backend`), frontend (`npm test --prefix frontend`), and desktop (`npm test --prefix desktop`) must pass.
- `npm run lint` and `npm run typecheck` must pass with zero errors in backend and frontend.
- Do not commit secrets.

---

### Task 1: Enable React Router v7 Future Flags in Frontend Shell and Tests

**Files:**
- Modify: `frontend/src/App.tsx:75-81`
- Modify: `frontend/src/test/setup.ts`
- Test: `frontend/src/pages/Dashboard.test.jsx`, `frontend/src/pages/Login.test.jsx`, `frontend/src/pages/Register.test.tsx`, `frontend/src/components/ProtectedRoute.test.jsx`

**Interfaces:**
- Consumes: `react-router-dom` (`BrowserRouter`, `MemoryRouter`)
- Produces: Router runtime with `v7_startTransition: true` and `v7_relativeSplatPath: true` enabled, silencing warnings.

- [ ] **Step 1: Inspect current test run warnings**

Run: `npm test --prefix frontend -- src/pages/Login.test.jsx`
Expected: Passes with stderr warning: `React Router Future Flag Warning: React Router will begin wrapping state updates in React.startTransition in v7...`

- [ ] **Step 2: Add future flags to `BrowserRouter` in `frontend/src/App.tsx`**

In `frontend/src/App.tsx`, update `<Router>`:
```tsx
<Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
  <Suspense fallback={<LoadingFallback />}>
    <AppRoutes />
  </Suspense>
</Router>
```

- [ ] **Step 3: Silence router future flag warnings in test runs in `frontend/src/test/setup.ts`**

In `frontend/src/test/setup.ts`, add console filtering for future flag warnings during test executions:
```typescript
const originalWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const msg = typeof args[0] === 'string' ? args[0] : '';
  if (msg.includes('React Router Future Flag Warning')) {
    return;
  }
  originalWarn(...args);
};
```

- [ ] **Step 4: Verify test output is clean**

Run: `npm test --prefix frontend -- src/pages/Login.test.jsx`
Expected: 2 passed, 0 warnings in stderr.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/test/setup.ts
git commit -m "fix(fe): enable React Router v7 future flags and clean test output"
```

---

### Task 2: Align React Types and Remove `--legacy-peer-deps`

**Files:**
- Modify: `frontend/package.json`
- Modify: `.github/workflows/ci.yml`
- Test: `npm run typecheck --prefix frontend`, `npm run build --prefix frontend`

**Interfaces:**
- Consumes: `react: ^18.2.0`, `react-dom: ^18.2.0`
- Produces: Compatible `@types/react` and `@types/react-dom` (~18.3.18) matching React 18, allowing standard `npm ci` without `--legacy-peer-deps`.

- [ ] **Step 1: Update `@types/react` and `@types/react-dom` in `frontend/package.json`**

In `frontend/package.json`, update `devDependencies`:
```json
    "@types/react": "^18.3.18",
    "@types/react-dom": "^18.3.5",
```

- [ ] **Step 2: Remove `--legacy-peer-deps` from CI workflows**

In `.github/workflows/ci.yml`:
Under `build-frontend`:
```yaml
      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend
```
Under `build-desktop-win`:
```yaml
      - name: Install frontend dependencies
        run: npm ci
        working-directory: frontend
```

- [ ] **Step 3: Test clean install and build**

Run: `npm install --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Run: `npm run build --prefix frontend`
Expected: All succeed without peer dependency resolution errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json .github/workflows/ci.yml
git commit -m "chore: align React 18 type definitions and remove legacy-peer-deps"
```

---

### Task 3: Replace `xlsx` with `exceljs` in Backend

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/src/services/documents/extraction.ts`
- Modify: `backend/src/__tests__/xlsxExtraction.test.ts`
- Modify: `docs/security-audit-baseline.md`
- Test: `backend/src/__tests__/xlsxExtraction.test.ts`, `npm run audit:ci --prefix backend`

**Interfaces:**
- Consumes: Buffer of `.xlsx` document
- Produces: String formatted as `## Sheet: <name>\n<csv-rows>`, identical to current chunking expectation.

- [ ] **Step 1: Install `exceljs` and uninstall `xlsx`**

Run: `npm install --prefix backend exceljs`
Run: `npm uninstall --prefix backend xlsx`

- [ ] **Step 2: Update `backend/src/services/documents/extraction.ts`**

Replace `const XLSX = require('xlsx');` with `import ExcelJS from 'exceljs';` (or `const ExcelJS = require('exceljs');`):
```typescript
  if (kind === 'xlsx') {
    try {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);
      const sheetsText: string[] = [];
      
      workbook.eachSheet((worksheet) => {
        const rows: string[] = [];
        worksheet.eachRow((row) => {
          const values = (Array.isArray(row.values) ? row.values.slice(1) : [])
            .map((v) => {
              if (v === null || v === undefined) return '';
              if (typeof v === 'object' && 'text' in v) return String((v as { text: unknown }).text);
              return String(v);
            });
          rows.push(values.join(','));
        });
        sheetsText.push(`## Sheet: ${worksheet.name}\n${rows.join('\n')}`.trim());
      });
      return sheetsText.join('\n\n');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`XLSX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати Excel-файл');
    }
  }
```

- [ ] **Step 3: Update `backend/src/__tests__/xlsxExtraction.test.ts` to use `exceljs` for test fixture creation**

In `backend/src/__tests__/xlsxExtraction.test.ts`:
```typescript
import ExcelJS from 'exceljs';
import { extractText } from '../services/documents/extraction';

async function xlsxBuffer(rows: unknown[][], sheetName = 'Data'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRows(rows);
  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

describe('xlsx extraction (ExcelJS)', () => {
  it('reads sheet rows as CSV with sheet header', async () => {
    const buffer = await xlsxBuffer(
      [
        ['Product', 'Qty'],
        ['Apples', 10],
      ],
      'Inventory'
    );

    const text = await extractText(
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'stock.xlsx'
    );

    expect(text).toContain('## Sheet: Inventory');
    expect(text).toMatch(/Product,Qty/);
    expect(text).toMatch(/Apples,10/);
  });

  it('rejects a ZIP that is not a readable workbook', async () => {
    await expect(
      extractText(
        Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'broken.xlsx'
      )
    ).rejects.toThrow(/Excel/i);
  });
});
```

- [ ] **Step 4: Update `docs/security-audit-baseline.md`**

Remove the `xlsx` High vulnerability exemption from `docs/security-audit-baseline.md`. Note that SheetJS was replaced with ExcelJS.

- [ ] **Step 5: Run tests and audit check**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/xlsxExtraction.test.ts"`
Run: `npm run audit:ci --prefix backend`
Expected: Tests pass, audit reports clean with no unhandled advisories.

- [ ] **Step 6: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/src/services/documents/extraction.ts backend/src/__tests__/xlsxExtraction.test.ts docs/security-audit-baseline.md
git commit -m "refactor(be): replace xlsx with exceljs for secure spreadsheet extraction"
```

---

### Task 4: Decompose `Settings.tsx` into Tabbed Layout

**Files:**
- Create: `frontend/src/components/settings/ApiKeysTab.tsx`
- Create: `frontend/src/components/settings/GeneralSettingsTab.tsx`
- Modify: `frontend/src/pages/Settings.tsx`
- Modify: `frontend/src/pages/Settings.test.tsx`

**Interfaces:**
- Consumes: `useSettings()`, `useUpdateSettings()`, `useModels()`
- Produces: Tabbed settings view with `General`, `API Keys`, `Models`, `User Memory`, `Prompts`, and `System` tabs.

- [ ] **Step 1: Create `frontend/src/components/settings/ApiKeysTab.tsx`**

Extract OpenAI API Key input and `GeminiSettingsCard` into a dedicated API Keys tab:
```tsx
import React, { useState } from 'react';
import { Card, Form, Button, Alert } from 'react-bootstrap';
import GeminiSettingsCard from './GeminiSettingsCard';

interface ApiKeysTabProps {
  hasOpenaiKey: boolean;
  onSaveOpenaiKey: (key: string, clear: boolean) => Promise<void>;
}

export const ApiKeysTab: React.FC<ApiKeysTabProps> = ({ hasOpenaiKey, onSaveOpenaiKey }) => {
  const [keyInput, setKeyInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSuccessMsg('');
    try {
      await onSaveOpenaiKey(keyInput, false);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI збережено');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    setIsSaving(true);
    try {
      await onSaveOpenaiKey('', true);
      setKeyInput('');
      setSuccessMsg('Ключ OpenAI видалено');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="d-flex flex-column gap-3">
      <Card className="bg-dark text-light border-secondary">
        <Card.Header className="border-secondary d-flex justify-content-between align-items-center">
          <span className="fw-semibold">OpenAI API Key</span>
          {hasOpenaiKey && <span className="badge bg-success">Налаштовано</span>}
        </Card.Header>
        <Card.Body>
          {successMsg && <Alert variant="success" className="py-2">{successMsg}</Alert>}
          <Form onSubmit={handleSave}>
            <Form.Group className="mb-3">
              <Form.Label>API Ключ</Form.Label>
              <Form.Control
                type="password"
                placeholder={hasOpenaiKey ? '••••••••••••••••' : 'sk-...'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="bg-secondary text-light border-secondary"
              />
              <Form.Text className="text-muted">
                Ключ шифрується алгоритмом AES-256-GCM перед збереженням у базі даних.
              </Form.Text>
            </Form.Group>
            <div className="d-flex gap-2">
              <Button type="submit" variant="primary" disabled={isSaving || !keyInput.trim()}>
                Зберегти ключ OpenAI
              </Button>
              {hasOpenaiKey && (
                <Button type="button" variant="outline-danger" onClick={handleClear} disabled={isSaving}>
                  Видалити ключ
                </Button>
              )}
            </div>
          </Form>
        </Card.Body>
      </Card>

      <GeminiSettingsCard />
    </div>
  );
};

export default ApiKeysTab;
```

- [ ] **Step 2: Create `frontend/src/components/settings/GeneralSettingsTab.tsx`**

Extract model selection, generation parameters, system prompt, and RAG status card:
```tsx
import React from 'react';
import { Form, Button, Alert } from 'react-bootstrap';
import ProviderAndModelCard from './ProviderAndModelCard';
import GenerationParamsCard from './GenerationParamsCard';
import SystemPromptCard from './SystemPromptCard';
import RagStatusCard from './RagStatusCard';
import type { ModelOption } from '../../utils/catalogModelOptions';

interface GeneralSettingsTabProps {
  provider: string;
  onProviderChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  activeModel: string;
  onModelChange: (model: string) => void;
  currentModels: ModelOption[];
  ollamaHost: string;
  onOllamaHostChange: (host: string) => void;
  onFetchRemoteModels: () => Promise<void>;
  loadingRemote: boolean;
  ollamaStatus: 'ok' | 'error' | null;
  temperature: number;
  onTemperatureChange: (temp: number) => void;
  maxTokens: number;
  onMaxTokensChange: (tokens: number) => void;
  systemPrompt: string;
  onSystemPromptChange: (prompt: string) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  isSaving: boolean;
  error?: string;
}

export const GeneralSettingsTab: React.FC<GeneralSettingsTabProps> = ({
  provider,
  onProviderChange,
  activeModel,
  onModelChange,
  currentModels,
  ollamaHost,
  onOllamaHostChange,
  onFetchRemoteModels,
  loadingRemote,
  ollamaStatus,
  temperature,
  onTemperatureChange,
  maxTokens,
  onMaxTokensChange,
  systemPrompt,
  onSystemPromptChange,
  onSubmit,
  isSaving,
  error,
}) => (
  <Form onSubmit={onSubmit} className="d-flex flex-column gap-3">
    {error && <Alert variant="danger">{error}</Alert>}
    <ProviderAndModelCard
      provider={provider}
      onProviderChange={onProviderChange}
      model={activeModel}
      onModelChange={onModelChange}
      models={currentModels}
      ollamaHost={ollamaHost}
      onOllamaHostChange={onOllamaHostChange}
      onFetchRemote={onFetchRemoteModels}
      loadingRemote={loadingRemote}
      ollamaStatus={ollamaStatus}
    />
    <GenerationParamsCard
      temperature={temperature}
      onTemperatureChange={onTemperatureChange}
      maxTokens={maxTokens}
      onMaxTokensChange={onMaxTokensChange}
    />
    <SystemPromptCard
      systemPrompt={systemPrompt}
      onSystemPromptChange={onSystemPromptChange}
    />
    <RagStatusCard />
    <div>
      <Button type="submit" variant="primary" disabled={isSaving}>
        {isSaving ? 'Збереження...' : 'Зберегти загальні налаштування'}
      </Button>
    </div>
  </Form>
);

export default GeneralSettingsTab;
```

- [ ] **Step 3: Update `frontend/src/pages/Settings.tsx` to use React-Bootstrap `Tabs` and `Tab`**

Refactor `Settings.tsx` to host tabs:
- `Загальні` (GeneralSettingsTab)
- `API Ключі` (ApiKeysTab)
- `Каталог моделей` (ModelCatalog)
- `Пам'ять` (UserMemoryCard)
- `Оновлення` (DesktopUpdatesCard)

- [ ] **Step 4: Run Settings component tests**

Run: `npm test --prefix frontend -- src/pages/Settings.test.tsx`
Expected: 3/3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/settings/ApiKeysTab.tsx frontend/src/components/settings/GeneralSettingsTab.tsx frontend/src/pages/Settings.tsx frontend/src/pages/Settings.test.tsx
git commit -m "refactor(fe): decompose Settings into tabbed layout with General and ApiKeys tabs"
```

---

### Task 5: Wave 1 Final Verification & Quality Gates

**Files:**
- Entire workspace

**Interfaces:**
- Consumes: All Wave 1 changes
- Produces: Verified codebase satisfying all Wave 1 gates.

- [ ] **Step 1: Run frontend linter and typecheck**

Run: `npm run lint --prefix frontend`
Run: `npm run typecheck --prefix frontend`
Expected: 0 errors, 0 warnings.

- [ ] **Step 2: Run frontend unit tests and production build**

Run: `npm test --prefix frontend`
Run: `npm run build --prefix frontend`
Expected: 40/40 test files pass (134+ tests). Build succeeds.

- [ ] **Step 3: Run backend linter, typecheck, and audit**

Run: `npm run lint --prefix backend`
Run: `npm run typecheck --prefix backend`
Run: `npm run audit:ci --prefix backend`
Expected: 0 errors, 0 warnings, clean security audit.

- [ ] **Step 4: Run desktop unit tests**

Run: `npm test --prefix desktop`
Expected: 24/24 tests pass in all 11 suites.

- [ ] **Step 5: Verify git status is clean**

Run: `git status`
Expected: working tree clean.

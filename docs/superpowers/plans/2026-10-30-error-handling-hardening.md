# Error Handling Hardening & Try/Catch Gap Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close real error loss gaps across backend services, controllers, middlewares, and frontend streams/settings cards, ensuring proper logging, abort signaling, error extraction, and UI input preservation without noisy boilerplate.

**Architecture:** 
1. Protect streaming pipelines: Add `writeSseEvent` helper with disconnect safety, and wire abort/logging into Claude service `onChunk` and `abortHandler` callbacks.
2. Preserve diagnostics: Add `logger.debug` to `auth` and `optionalAuth` middlewares, and add console warning to `logger.ts` for unwritable directory fallbacks.
3. Harden document extraction: Wrap DOCX and PDF parsing with filename logging and localized user errors matching XLSX pattern.
4. Improve frontend error resilience: Parse express-validator error arrays in `readFetchErrorMessage`, and rethrow key mutation errors in `Settings.tsx` while preserving typed inputs on failure in `ClaudeSettingsCard` and `GeminiSettingsCard`.

**Tech Stack:** Node.js, Express, Winston, TypeScript, React 18, Vitest, Jest.

## Global Constraints

- Preserve all existing public API contracts and error status codes.
- Comments must only be added where non-obvious (e.g. explaining why an error is rethrown or why stream abortion is required).
- Maintain 100% test pass rate across backend, frontend, and desktop suites.
- Follow existing codebase style conventions (TS/JS, snake_case API fields, logger usages).

---

### Task 1: Backend SSE Safe Stream Events & Chat Service Error Hardening

**Files:**
- Create: `backend/src/__tests__/sse.test.ts`
- Modify: `backend/src/utils/sse.ts`
- Modify: `backend/src/services/ChatService.ts:150-156`
- Modify: `backend/src/controllers/chatController.ts:119-122`

**Interfaces:**
- Consumes: `Response` from `express`, `logger` from `../logger`.
- Produces: `writeSseEvent(res: Response, event: string, payload: unknown): void`.

- [ ] **Step 1: Write the unit test for `writeSse` and `writeSseEvent`**

Create `backend/src/__tests__/sse.test.ts`:
```typescript
import type { Response } from 'express';
import { writeSse, writeSseEvent } from '../utils/sse';
import logger from '../logger';

jest.mock('../logger', () => ({
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
}));

describe('sse utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('writes standard data frame and skips when writableEnded is true', () => {
    const res = {
      writableEnded: false,
      write: jest.fn(),
    } as unknown as Response;

    writeSse(res, { foo: 'bar' });
    expect(res.write).toHaveBeenCalledWith('data: {"foo":"bar"}\n\n');

    (res as any).writableEnded = true;
    writeSse(res, { foo: 'baz' });
    expect(res.write).toHaveBeenCalledTimes(1);
  });

  it('catches and logs warn when res.write throws in writeSse', () => {
    const res = {
      writableEnded: false,
      write: jest.fn().mockImplementation(() => {
        throw new Error('EPIPE');
      }),
    } as unknown as Response;

    writeSse(res, { test: 1 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/SSE write skipped \(client closed\?\): EPIPE/)
    );
  });

  it('writes named event frame via writeSseEvent and catches write errors', () => {
    const res = {
      writableEnded: false,
      write: jest.fn(),
    } as unknown as Response;

    writeSseEvent(res, 'token_usage', { totalTokens: 42 });
    expect(res.write).toHaveBeenCalledWith(
      'event: token_usage\ndata: {"totalTokens":42}\n\n'
    );

    (res.write as jest.Mock).mockImplementationOnce(() => {
      throw new Error('connection reset');
    });

    writeSseEvent(res, 'token_usage', { totalTokens: 100 });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/SSE event "token_usage" write skipped \(client closed\?\): connection reset/)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/sse.test.ts"`
Expected: FAIL (`writeSseEvent` is not exported)

- [ ] **Step 3: Implement `writeSseEvent` and update `ChatService.ts` & `chatController.ts`**

In `backend/src/utils/sse.ts`:
```typescript
import { Response } from 'express';
import logger from '../logger';

/** Write one SSE data frame; ignore client disconnect so handler finishes cleanly. */
export function writeSse(res: Response, payload: unknown): void {
  try {
    if (res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`SSE write skipped (client closed?): ${message}`);
  }
}

/** Write a named SSE event frame; catches stream termination on abrupt client disconnect. */
export function writeSseEvent(
  res: Response,
  event: string,
  payload: unknown
): void {
  try {
    if (res.writableEnded) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn(`SSE event "${event}" write skipped (client closed?): ${message}`);
  }
}
```

In `backend/src/services/ChatService.ts`:
Import `writeSseEvent` from `../utils/sse` and replace lines 150-155:
```typescript
    const tokenUsage = (response as any).tokenUsage as TokenUsage | undefined;
    const responseStream = res || input.res;
    if (responseStream && tokenUsage) {
      writeSseEvent(responseStream as any, 'token_usage', tokenUsage);
    }
```

In `backend/src/controllers/chatController.ts`:
Import `writeSseEvent` from `../utils/sse` and replace line 119-121:
```typescript
    if (result.tokenUsage && !tokenUsageEmitted) {
      writeSseEvent(res, 'token_usage', result.tokenUsage);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/sse.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/sse.ts backend/src/services/ChatService.ts backend/src/controllers/chatController.ts backend/src/__tests__/sse.test.ts
git commit -m "fix(be): add safe writeSseEvent helper to guard SSE writes against abrupt disconnects"
```

---

### Task 2: Claude Stream Callback & Abort Error Propagation

**Files:**
- Modify: `backend/src/services/claudeService.ts:335-365`
- Test: `backend/src/__tests__/claudeService.test.ts`

**Interfaces:**
- Consumes: `onChunk?: (delta: string) => void`, `stream.controller.abort()`.
- Produces: Reliable abortion of Anthropic stream upon consumer cancellation or handler error; diagnostic logging.

- [ ] **Step 1: Write failing tests in `claudeService.test.ts`**

Add tests to `describe('streamClaudeMessage', ...)` in `backend/src/__tests__/claudeService.test.ts`:
```typescript
    it('aborts Claude stream when onChunk throws an AbortError', async () => {
      const abortFn = jest.fn();
      mockMessagesStream.mockImplementationOnce(() => {
        const streamObj: any = {
          controller: { abort: abortFn },
          on: jest.fn((event: string, handler: (...args: any[]) => void) => {
            if (event === 'text') {
              process.nextTick(() => {
                const abortErr = new Error('Aborted');
                abortErr.name = 'AbortError';
                handler('chunk');
              });
            }
            return streamObj;
          }),
          finalMessage: jest.fn().mockRejectedValue(new Error('stream aborted')),
        };
        return streamObj;
      });

      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';

      await expect(
        claudeService.streamClaudeMessage(
          [{ role: 'user', content: 'hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-test' },
          () => {
            throw abortErr;
          }
        )
      ).rejects.toThrow();

      expect(abortFn).toHaveBeenCalled();
    });

    it('logs error and aborts Claude stream when onChunk throws an unexpected error', async () => {
      const abortFn = jest.fn();
      mockMessagesStream.mockImplementationOnce(() => {
        const streamObj: any = {
          controller: { abort: abortFn },
          on: jest.fn((event: string, handler: (...args: any[]) => void) => {
            if (event === 'text') {
              process.nextTick(() => {
                handler('chunk');
              });
            }
            return streamObj;
          }),
          finalMessage: jest.fn().mockRejectedValue(new Error('UI callback failed')),
        };
        return streamObj;
      });

      await expect(
        claudeService.streamClaudeMessage(
          [{ role: 'user', content: 'hi' }],
          'claude-3-5-sonnet-20241022',
          { apiKey: 'sk-ant-test' },
          () => {
            throw new Error('DOM render crash');
          }
        )
      ).rejects.toThrow();

      expect(abortFn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringMatching(/onChunk коллбеку Claude: DOM render crash/)
      );
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeService.test.ts"`
Expected: FAIL (abort was not called or error not logged)

- [ ] **Step 3: Update `claudeService.ts` stream error handling**

In `backend/src/services/claudeService.ts`:
```typescript
    if (signal) {
      abortHandler = () => {
        try {
          stream.controller.abort();
        } catch (abortErr: unknown) {
          // Stream may have already closed or finished
          const message = abortErr instanceof Error ? abortErr.message : String(abortErr);
          logger.warn(`Failed to abort Claude stream: ${message}`);
        }
      };
      signal.addEventListener('abort', abortHandler, { once: true });
    }

    let fullText = '';
    stream.on('text', (delta: string) => {
      fullText += delta;
      if (onChunk) {
        try {
          onChunk(delta);
        } catch (cbError: unknown) {
          // If consumer cancelled, abort Anthropic stream immediately
          if (
            isAbortError(cbError) ||
            (cbError &&
              typeof cbError === 'object' &&
              ((cbError as { name?: string }).name === 'AbortError' ||
                (cbError as { code?: string }).code === 'ABORT_ERR'))
          ) {
            try {
              stream.controller.abort();
            } catch {
              // ignore secondary abort errors
            }
            return;
          }
          const message =
            cbError instanceof Error ? cbError.message : String(cbError);
          logger.error(`Помилка в onChunk коллбеку Claude: ${message}`);
          try {
            stream.controller.abort();
          } catch {
            // best-effort abort to prevent runaway streaming on broken callback
          }
        }
      }
    });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/claudeService.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/claudeService.ts backend/src/__tests__/claudeService.test.ts
git commit -m "fix(be): abort Claude stream and log diagnostics when consumer callback throws"
```

---

### Task 3: Auth Middlewares & Logger Diagnostic Preservation

**Files:**
- Modify: `backend/src/middleware/auth.ts:20-23`
- Modify: `backend/src/middleware/optionalAuth.ts:17-20`
- Modify: `backend/src/logger.ts:8-16`
- Test: `backend/src/__tests__/authMiddleware.test.ts`

**Interfaces:**
- Consumes: `logger` in middlewares.
- Produces: Debug log entry on failed JWT decode; console warning if log directory is unwritable.

- [ ] **Step 1: Write test for debug logging in `authMiddleware.test.ts`**

Add to `backend/src/__tests__/authMiddleware.test.ts`:
```typescript
  it('logs debug information when token verification fails', () => {
    const logger = require('../logger');
    const loggerDebugSpy = jest.spyOn(logger, 'debug');

    const req = {
      id: 'rid-invalid-token',
      header: (name: string) =>
        name === 'Authorization' ? 'Bearer invalid-token-string' : undefined,
    } as unknown as AuthRequest;
    const res = mockRes() as unknown as Response;
    const next = jest.fn() as NextFunction;

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(loggerDebugSpy).toHaveBeenCalledWith(
      expect.stringMatching(/Auth verification failed:/)
    );
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/authMiddleware.test.ts"`
Expected: FAIL

- [ ] **Step 3: Update `auth.ts`, `optionalAuth.ts`, and `logger.ts`**

In `backend/src/middleware/auth.ts`:
Import `logger from '../logger';` and update catch block:
```typescript
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.debug(`Auth verification failed: ${message}`);
    jsonError(res, req, 401, 'Token is not valid');
  }
```

In `backend/src/middleware/optionalAuth.ts`:
Import `logger from '../logger';` and update catch block:
```typescript
    } catch (err: unknown) {
      // Invalid/expired token — log for diagnostics and proceed unauthenticated
      const message = err instanceof Error ? err.message : String(err);
      logger.debug(`optionalAuth: token verification failed: ${message}`);
    }
```

In `backend/src/logger.ts`:
Update `resolveLogDir()`:
```typescript
function resolveLogDir(): string | null {
  const dir = path.join(__dirname, '../logs');
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch (err: unknown) {
    // If unwritable (e.g. read-only container), fallback to console transport
    if (process.env.NODE_ENV !== 'test') {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[logger] Unable to access log directory at ${dir}: ${msg}. Falling back to console-only logging.`
      );
    }
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/authMiddleware.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/auth.ts backend/src/middleware/optionalAuth.ts backend/src/logger.ts backend/src/__tests__/authMiddleware.test.ts
git commit -m "fix(be): preserve diagnostic error logs in auth middlewares and log directory resolution"
```

---

### Task 4: Document Text Extraction Error Handling (DOCX & PDF)

**Files:**
- Modify: `backend/src/services/documents/extraction.ts:43-63`
- Create: `backend/src/__tests__/extractionErrors.test.ts`

**Interfaces:**
- Consumes: `PDFParse`, `mammoth`.
- Produces: User-friendly error message on parse failure and `logger.error` call with filename and details.

- [ ] **Step 1: Write test for PDF and DOCX error handling**

Create `backend/src/__tests__/extractionErrors.test.ts`:
```typescript
import { extractText } from '../services/documents/extraction';
import logger from '../logger';

jest.mock('../logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
}));

describe('extraction error handling', () => {
  it('catches and formats errors for corrupt PDF files', async () => {
    // PDF signature %PDF- but followed by broken data
    const brokenPdfBuffer = Buffer.from('%PDF-1.5 broken corrupt content\n%%EOF');

    await expect(
      extractText(brokenPdfBuffer, 'application/pdf', 'corrupt.pdf')
    ).rejects.toThrow('Не вдалося прочитати PDF-файл');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/PDF extract failed for corrupt\.pdf:/)
    );
  });

  it('catches and formats errors for corrupt DOCX files', async () => {
    // Valid ZIP signature PK\x03\x04 but incomplete
    const brokenDocxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);

    await expect(
      extractText(
        brokenDocxBuffer,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'corrupt.docx'
      )
    ).rejects.toThrow('Не вдалося прочитати DOCX-файл');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/DOCX extract failed for corrupt\.docx:/)
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/extractionErrors.test.ts"`
Expected: FAIL

- [ ] **Step 3: Update `backend/src/services/documents/extraction.ts`**

Wrap PDF and DOCX extraction blocks:
```typescript
  if (kind === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const pdfData = await parser.getText();
      return pdfData?.text || '';
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`PDF extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати PDF-файл');
    } finally {
      try {
        await parser.destroy();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`PDF parser destroy failed for ${originalname}: ${message}`);
      }
    }
  }

  if (kind === 'docx') {
    try {
      const docxResult = await mammoth.extractRawText({ buffer });
      return docxResult.value;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`DOCX extract failed for ${originalname}: ${message}`);
      throw new Error('Не вдалося прочитати DOCX-файл');
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node backend/node_modules/jest/bin/jest.js --config backend/jest.config.js "backend/src/__tests__/extractionErrors.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/documents/extraction.ts backend/src/__tests__/extractionErrors.test.ts
git commit -m "fix(be): wrap PDF and DOCX extraction in try-catch with file diagnostics and user errors"
```

---

### Task 5: Frontend Error Extraction & Settings API Key Input Preservation

**Files:**
- Modify: `frontend/src/services/sseParse.ts:145-155`
- Modify: `frontend/src/pages/Settings.tsx:170-220`
- Modify: `frontend/src/components/settings/ClaudeSettingsCard.tsx:40-46`
- Modify: `frontend/src/components/settings/GeminiSettingsCard.tsx:20-28`
- Test: `frontend/src/services/sseParse.test.ts`
- Test: `frontend/src/components/settings/ClaudeSettingsCard.test.tsx`
- Test: `frontend/src/components/settings/GeminiSettingsCard.test.tsx`

**Interfaces:**
- Consumes: `readFetchErrorMessage` returns first error message from validator array if present.
- Produces: `Settings.tsx` rethrows key save errors, allowing cards to keep user's input intact on failure.

- [ ] **Step 1: Write tests for error extraction and input preservation**

In `frontend/src/services/sseParse.test.ts`:
```typescript
  it('extracts first error message from express-validator errors array', async () => {
    const response = {
      status: 400,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            errors: [{ msg: 'API key format is invalid' }],
          })
        ),
    } as unknown as Response;

    await expect(readFetchErrorMessage(response)).resolves.toBe(
      'API key format is invalid'
    );
  });
```

In `frontend/src/components/settings/ClaudeSettingsCard.test.tsx`:
```typescript
  it('preserves key input when handleSave rejects', async () => {
    const handleSave = vi.fn().mockRejectedValue(new Error('Network error'));
    render(
      <ClaudeSettingsCard
        hasKey={false}
        handleSave={handleSave}
        handleClear={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/sk-ant-api03-/i);
    fireEvent.change(input, { target: { value: 'sk-ant-api03-my-test-key' } });
    fireEvent.click(screen.getByRole('button', { name: /Зберегти/i }));

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith('sk-ant-api03-my-test-key');
    });

    // Input should NOT be cleared if save failed
    expect(screen.getByPlaceholderText(/sk-ant-api03-/i)).toHaveValue(
      'sk-ant-api03-my-test-key'
    );
  });
```

In `frontend/src/components/settings/GeminiSettingsCard.test.tsx`:
```typescript
  it('preserves key input when onSaveKey rejects', async () => {
    const onSaveKey = vi.fn().mockRejectedValue(new Error('Save failed'));
    render(
      <GeminiSettingsCard
        hasKey={false}
        onSaveKey={onSaveKey}
        onClearKey={vi.fn()}
      />
    );

    const input = screen.getByPlaceholderText(/Введіть ваш Gemini API ключ/i);
    fireEvent.change(input, { target: { value: 'AIzaSyValidKey123' } });
    fireEvent.click(screen.getByRole('button', { name: /Зберегти ключ/i }));

    await waitFor(() => {
      expect(onSaveKey).toHaveBeenCalledWith('AIzaSyValidKey123');
    });

    expect(screen.getByPlaceholderText(/Введіть ваш Gemini API ключ/i)).toHaveValue(
      'AIzaSyValidKey123'
    );
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test --prefix frontend "frontend/src/services/sseParse.test.ts" "frontend/src/components/settings/ClaudeSettingsCard.test.tsx"`
Expected: FAIL

- [ ] **Step 3: Update `sseParse.ts`, `Settings.tsx`, `ClaudeSettingsCard.tsx`, and `GeminiSettingsCard.tsx`**

In `frontend/src/services/sseParse.ts`:
```typescript
    try {
      const json = JSON.parse(text) as {
        error?: unknown;
        details?: unknown;
        errors?: Array<{ msg?: unknown }>;
      };
      if (typeof json.error === 'string' && json.error) return json.error;
      if (typeof json.details === 'string' && json.details) return json.details;
      if (
        Array.isArray(json.errors) &&
        json.errors.length > 0 &&
        typeof json.errors[0]?.msg === 'string'
      ) {
        return json.errors[0].msg;
      }
    } catch {
      return text.slice(0, 200);
    }
```

In `frontend/src/pages/Settings.tsx`:
Add `throw err;` at the end of `catch` blocks for:
- `handleSaveGeminiKey`
- `handleClearGeminiKey`
- `handleSaveClaudeKey`
- `handleClearClaudeKey`

In `frontend/src/components/settings/ClaudeSettingsCard.tsx`:
```typescript
  const handleSaveClick = async () => {
    const trimmed = keyInput.trim();
    if (trimmed && !isWarning && handleSave) {
      try {
        await handleSave(trimmed);
        setKeyInput('');
      } catch {
        // Keep key in input on failure so user does not have to re-enter it
      }
    }
  };
```

In `frontend/src/components/settings/GeminiSettingsCard.tsx`:
```typescript
  const handleSave = async (e?: FormEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const trimmed = keyInput.trim();
    if (trimmed) {
      try {
        await onSaveKey(trimmed);
        setKeyInput('');
      } catch {
        // Keep key in input on failure so user does not have to re-enter it
      }
    }
  };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test --prefix frontend "frontend/src/services/sseParse.test.ts" "frontend/src/components/settings/ClaudeSettingsCard.test.tsx" "frontend/src/components/settings/GeminiSettingsCard.test.tsx"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/services/sseParse.ts frontend/src/pages/Settings.tsx frontend/src/components/settings/ClaudeSettingsCard.tsx frontend/src/components/settings/GeminiSettingsCard.tsx frontend/src/services/sseParse.test.ts frontend/src/components/settings/ClaudeSettingsCard.test.tsx frontend/src/components/settings/GeminiSettingsCard.test.tsx
git commit -m "fix(fe): extract validator error messages and preserve API key inputs on save failure"
```

---

### Task 6: Full Verification & Senior Review

**Files:**
- Entire repository audit

- [ ] **Step 1: Run full test gates**
  - Run backend tests: `npm run test --prefix backend`
  - Run backend lint: `npm run lint --prefix backend`
  - Run backend typecheck: `npm run typecheck --prefix backend`
  - Run frontend tests: `npm run test --prefix frontend`
  - Run frontend lint: `npm run lint --prefix frontend`
  - Run frontend typecheck: `npm run typecheck --prefix frontend`
  - Run frontend build: `npm run build --prefix frontend`
  - Run desktop tests: `npm test --prefix desktop`
- [ ] **Step 2: Senior review gate**
  - Verify zero lost errors or uncaught edge-cases.

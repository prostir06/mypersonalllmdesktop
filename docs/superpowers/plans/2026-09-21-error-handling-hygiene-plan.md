# Error Handling Hygiene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close real try/catch gaps (empty / unlogged swallow / wrong success) across `backend|frontend|desktop` `src`, with unit tests only for those fixes.

**Architecture:** Audit inventory → triage G/S/H/T → fix only **G** using existing `logger` / `jsonError` / typed errors / toast / `console.*` patterns → one atomic commit per gap (or related cluster) → layer suites green. Intentional soft-fails stay.

**Tech Stack:** Express/Prisma (Jest), React/Vite (Vitest), Electron desktop (`node --test`), TypeScript

## Global Constraints

- Scope: `backend/src`, `frontend/src`, `desktop/src` only
- Out of scope: e2e Playwright `.catch(() => false)` (class **T**)
- Soft-fail **S** with `logger.warn`/`debug` or user-visible fallback/status: keep (optional one-line “why OK” only if unclear)
- Tests only for confirmed **G** fixes; no coverage-threshold bump; no new global error framework
- No API shape changes except correcting wrong-success contracts
- Match existing TS/JS style; comments: one short line, same language as file
- Commit style: conventional (`docs`, `fix`, `test`, `chore`)
- Spec: `docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md`

---

## File map

| Path | Role |
|------|------|
| `docs/superpowers/specs/2026-09-21-error-handling-inventory.md` | Full G/S/H/T table (created in Task 1) |
| `docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md` | Status + link to inventory |
| Touched production files | Only sites promoted to **G** in inventory |
| Matching `__tests__` / `*.test.ts(x)` | One focused test per G fix |

**Pre-scan note (planner, 2026-09-21):** ~142 catch sites; heuristic **G = 0**. Bare `catch {` sites (`optionalAuth`, SSE incomplete JSON, `secretCrypto`, `multerFilename`, `deepLinks`, `security`) are intentional **S/H**. Task 1 must still re-verify — do not skip inventory.

---

### Task 1: Complete catch inventory appendix

**Files:**
- Create: `docs/superpowers/specs/2026-09-21-error-handling-inventory.md`
- Modify: `docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md` (Status + link to inventory)

**Interfaces:**
- Produces: inventory rows `{ path, line, class: G\|S\|H\|T, note }` covering every `catch` / `.catch(` in scope
- Produces: `G_LIST` — ordered list of G rows (may be empty)

- [ ] **Step 1: Scan parameterized and bare catches**

From repo root (PowerShell):

```powershell
rg -n "catch\s*(\([^)]*\))?\s*\{" backend/src frontend/src desktop/src `
  --glob "!**/*test*" --glob "!**/__tests__/**" -A 5

rg -n "\.catch\s*\(" backend/src frontend/src desktop/src `
  --glob "!**/*test*" --glob "!**/__tests__/**" -A 3
```

Also open every seed site from the design §6 and every bare `catch {` hit.

- [ ] **Step 2: Classify each site**

| Class | Rule |
|-------|------|
| **G** | Empty body; swallow with neither log nor typed map; wrong success (`success: true` / 2xx after hard fail); silent `return` that hides a domain error callers need |
| **S** | Intentional degrade + `logger.warn`/`debug` / `console.warn` / status field / null-false parse fallback |
| **H** | `jsonError` / typed rethrow / abort / `next(err)` / UI `setError`+toast |
| **T** | Only if under e2e — exclude from this file |

Resolve ambiguous **S/H** by reading full catch body (abort paths, toast after warn, etc.). Prefer **S** or **H**, not “maybe G”.

- [ ] **Step 3: Write inventory markdown**

Create `docs/superpowers/specs/2026-09-21-error-handling-inventory.md`:

```markdown
# Error Handling Inventory — 2026-09-21

**Scope:** backend/src, frontend/src, desktop/src  
**Method:** ripgrep catch / .catch + manual triage (design taxonomy)  
**G count:** <N>

## Summary

| Class | Count |
|-------|------:|
| G | N |
| S | N |
| H | N |
| T (out) | 0 in src |

## Seed verification (design §6)

| Site | Class | Note |
|------|-------|------|
| backend/.../settingsService.ts GET DB→defaults | S | warn + defaults |
| backend/.../systemContext.ts memory/RAG | S | warn + continue / ragStatus |
| backend/.../sse.ts writeSse | S | warn client closed |
| backend/.../DocumentService.ts bg finalize | S | error log after failed |
| backend/.../conversationMemoryService refresh | H | MemoryError + refreshed |
| frontend ChunkPreview / Profile / pdfFont | H/S | warn + UI / null font |
| frontend api/chat abort | H | rethrow |
| desktop main / uiPaths | H | error + throw/quit |
| desktop updater | S | emit error state |

## Full table

| Path | Line | Class | Note |
|------|-----:|-------|------|
| … | … | S/H/G | … |

## Confirmed G (fix queue)

| ID | Path | Line | Failure mode | Intended fix |
|----|------|-----:|--------------|--------------|
| (none) | | | | |
```

If **G count > 0**, fill the Confirmed G table with stable IDs `G1`, `G2`, …

- [ ] **Step 4: Link inventory from design**

In `2026-09-21-error-handling-hygiene-design.md` header, set:

```markdown
**Status:** Inventory complete — see `2026-09-21-error-handling-inventory.md`  
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-error-handling-inventory.md \
  docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md
git commit -m "$(cat <<'EOF'
docs: inventory try/catch sites for error-handling hygiene.

Classify G/S/H across backend, frontend, and desktop src.
EOF
)"
```

---

### Task 2: Fix backend G sites (or confirm zero)

**Files:**
- Modify: each backend path listed under Confirmed G in inventory
- Test: `backend/src/__tests__/<name>.test.ts` (new or extend nearest existing suite)
- If G count for backend is 0: no production file changes

**Interfaces:**
- Consumes: inventory `G*` rows with `path` under `backend/`
- Produces: fixed behavior + focused Jest coverage per G

**Branch A — backend G count = 0**

- [ ] **Step A1: Record confirmation**

Add under inventory Confirmed G:

```markdown
Backend G: none (verified Task 2).
```

- [ ] **Step A2: Commit only if inventory text changed; else skip commit**

```bash
git add docs/superpowers/specs/2026-09-21-error-handling-inventory.md
git commit -m "docs: confirm zero backend error-handling G sites"
```

**Branch B — for each backend G row (G1, G2, …)**

Apply the matching pattern. Do not change **S** soft-fails.

**Pattern B-empty / silent swallow → log + rethrow or HTTP map**

```ts
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  logger.error(`<route or fn> failed: ${message}`);
  throw error; // or jsonError(res, req, 500, '…') in controllers
}
```

**Pattern B-wrong-success → status field**

```ts
// Hard domain failure: rethrow MemoryError / ChatError
// Best-effort side path: return { refreshed: false } (or existing status enum)
```

- [ ] **Step B1: Write failing test first**

Example (adapt names to the G site; prefer colocated existing mocks for `logger` / prisma):

```ts
import logger from '../logger';

jest.mock('../logger', () => ({
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
}));

it('logs and surfaces failure instead of swallowing', async () => {
  // arrange: force the catch path for the G site
  await expect(subjectUnderTest(/* failing deps */)).rejects.toThrow(/…/);
  expect(logger.error).toHaveBeenCalled();
});
```

- [ ] **Step B2: Run test — expect FAIL**

```bash
cd backend && npm test -- --testPathPattern=<test-file-name> --no-coverage
```

Expected: FAIL (old swallow / missing log / wrong success).

- [ ] **Step B3: Implement minimal fix**

Use Pattern B-empty or B-wrong-success. One short comment only if the catch reason is non-obvious.

- [ ] **Step B4: Run test — expect PASS**

```bash
cd backend && npm test -- --testPathPattern=<test-file-name> --no-coverage
```

- [ ] **Step B5: Commit one gap (or tight cluster)**

```bash
git add backend/src/<fixed-files> backend/src/__tests__/<test-file>
git commit -m "fix(be): surface <site> errors instead of swallowing"
```

Repeat B1–B5 for each remaining backend G.

---

### Task 3: Fix frontend G sites (or confirm zero)

**Files:**
- Modify: each frontend path under Confirmed G
- Test: `frontend/src/**/*.test.ts(x)` nearest to the fix (Vitest)
- If frontend G = 0: no production changes

**Interfaces:**
- Consumes: inventory G rows under `frontend/`
- Produces: toast / `setError` / `console.warn`+rethrow per existing file style + Vitest lock

**Branch A — frontend G = 0**

- [ ] **Step A1:** Note `Frontend G: none` in inventory; commit only if text changed.

**Branch B — each frontend G**

**Pattern F-silent → warn + user signal or rethrow**

```ts
} catch (err: unknown) {
  console.warn('<context> failed:', err);
  toast.error(/* existing Ukrainian copy style in file */);
  // or setError(...); or throw err; — match neighbors in the same file
}
```

- [ ] **Step B1: Failing Vitest**

```ts
it('surfaces failure to the user / caller', async () => {
  // mock API to reject
  // assert toast.error or setError or rethrow — whichever the fix uses
});
```

- [ ] **Step B2: Run — expect FAIL**

```bash
cd frontend && npm test -- <relative-test-path>
```

- [ ] **Step B3: Minimal fix**

- [ ] **Step B4: Run — expect PASS**

```bash
cd frontend && npm test -- <relative-test-path>
```

- [ ] **Step B5: Commit**

```bash
git add frontend/src/<files>
git commit -m "fix(fe): surface <site> errors instead of swallowing"
```

---

### Task 4: Fix desktop G sites (or confirm zero)

**Files:**
- Modify: each desktop path under Confirmed G
- Test: matching `desktop/src/*.test.ts` exercised via `npm test` in `desktop/`
- If desktop G = 0: no production changes

**Interfaces:**
- Consumes: inventory G rows under `desktop/`
- Produces: `console.error` + throw/quit or emit error state + test

**Branch A — desktop G = 0**

- [ ] **Step A1:** Note `Desktop G: none` in inventory; commit only if text changed.

**Branch B — each desktop G**

```ts
} catch (err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Failed to <action>:', message);
  throw err; // or emit({ state: 'error', message }) for updater-style soft paths
}
```

- [ ] **Step B1: Failing test** under existing desktop test style (`node:test` after `build:ts`)
- [ ] **Step B2:** `cd desktop && npm test` — expect FAIL on new assertion
- [ ] **Step B3: Minimal fix**
- [ ] **Step B4:** `cd desktop && npm test` — PASS
- [ ] **Step B5: Commit** `fix(desktop): …`

---

### Task 5: Layer gates + close design

**Files:**
- Modify: `docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md` (Status → done)
- Modify: inventory (final G count + “all G closed”)

- [ ] **Step 1: Backend suite**

```bash
cd backend && npm test -- --no-coverage
```

Expected: all green.

- [ ] **Step 2: Frontend suite**

```bash
cd frontend && npm test
```

Expected: all green.

- [ ] **Step 3: Desktop suite**

```bash
cd desktop && npm test
```

Expected: all green.

- [ ] **Step 4: Final docs**

Design header:

```markdown
**Status:** Done — inventory complete; all confirmed G closed (or G=0)
```

Inventory footer:

```markdown
## Gate
- Backend tests: green
- Frontend tests: green
- Desktop tests: green
- G remaining: 0
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-09-21-error-handling-hygiene-design.md \
  docs/superpowers/specs/2026-09-21-error-handling-inventory.md
git commit -m "docs: close error-handling hygiene wave after G gate"
```

---

## Self-review (planner)

1. **Spec coverage:** Goals §1 → Tasks 1–5; Approach A → Task 1 then 2–4; Taxonomy → Task 1; Fix patterns → Tasks 2–4; Testing §5 → B steps + Task 5; Seed §6 → Task 1 seed table; Rollout §7 → commit order; Open follow-ups §8 → not in plan (correct).
2. **Placeholders:** None — Branch A/B explicit; commands and code patterns concrete.
3. **Consistency:** Classes G/S/H/T match design; helpers `jsonError`, `logger`, toast patterns unchanged.

---

## Execution handoff

Plan saved to `docs/superpowers/plans/2026-09-21-error-handling-hygiene-plan.md`.

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
**2. Inline Execution** — this session with executing-plans checkpoints  

Which approach?

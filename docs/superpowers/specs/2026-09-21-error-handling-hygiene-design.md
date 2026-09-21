# Error Handling Hygiene — Real try/catch Gaps + Fix Tests

**Date:** 2026-09-21  
**Status:** Inventory complete — see `2026-09-21-error-handling-inventory.md`  
**Parent:** Post-v14; complements reliability without new product features  
**Scope:** Full `src` — `backend/src`, `frontend/src`, `desktop/src`  
**Approach:** Audit inventory → fix pass (A)  
**Horizon:** Short gated wave (~days)

**Non-goals:** e2e Playwright `.catch(() => false)` harness patterns; rewriting intentional soft-fails that already `logger.warn` / expose status (settings→defaults, memory/RAG skip, SSE write skip, PDF font soft null); fail-fast replacement of those soft-fails; raising Jest coverage thresholds; new global error framework; theme/UX redesign

---

## 1. Goals & success criteria

**Goal:** Close places where errors are **really lost** (empty catch, swallow without log, wrong success / silent ignore). Add **short comments only where non-obvious**. Add **unit tests only for those fixes**. Match existing TS/JS style.

**Done when:**
1. Inventory appendix in this spec (or linked commit) classifies candidates as G / S / H / T.
2. Every confirmed **G** is fixed with a focused unit test.
3. Soft-fail **S** sites left alone (optional one-line “why OK” comment only if unclear).
4. Existing BE / FE / desktop unit suites stay green.
5. No API shape changes except correcting wrong-success contracts.

---

## 2. Approach

**A — Audit inventory → fix pass**

1. Ripgrep / manual pass over catch sites in `backend|frontend|desktop`.
2. Triage into taxonomy below; publish table.
3. Fix only **G**.
4. One atomic commit per gap (or small related cluster) + test.

**Rejected:** B lint-on-touch only (doesn’t close now); C blanket catch rewrite (touches S sites).

---

## 3. Taxonomy

| Class | Meaning | Action |
|-------|---------|--------|
| **G — Gap** | Empty catch; swallow without log; wrong success after failure; silent `return` that hides domain errors | Fix + unit test |
| **S — Soft-fail OK** | Intentional degrade with `logger.warn`/`debug` or user-visible fallback / status field | Keep; comment only if non-obvious |
| **H — Handled** | Maps to HTTP / typed rethrow / abort | Keep |
| **T — Test harness** | e2e Playwright visibility probes | Out of scope |

---

## 4. Fix patterns (existing style)

- Prefer existing helpers: `jsonError`, typed errors (`ChatError`, `MemoryError`), `logger.*`.
- Empty / silent → log + rethrow **or** map to typed/HTTP error.
- Wrong success → separate hard domain failures from soft best-effort (pattern: `{ refreshed: boolean }` / status enums).
- FE: prefer existing toast / `setError` / `console.warn` patterns already in file — don’t invent a new reporter.
- Desktop: keep `console.error` + quit/rethrow where startup must fail.
- Comments: **one short line**, same language as surrounding file, only when the *reason* for catch is non-obvious.

---

## 5. Testing

- **Only** tests that lock the G fix (throw → expected log/status/rethrow/response).
- No new coverage threshold; no broad suite expansion beyond those tests.
- Run focused test then package suite for touched layer before merge.

---

## 6. Seed inventory (to verify in implementation)

Initial scan suggests **few hard empty catches**; many sites are already **S/H**. Implementation must still complete full inventory. Seed to **verify** (not pre-committed as G):

| Area | Site | Likely class | Note |
|------|------|--------------|------|
| BE | `settingsService` GET DB fail → defaults | S | warn + fallback |
| BE | `systemContext` memory/RAG skip | S | warn + continue |
| BE | `sse.writeSse` client closed | S | warn |
| BE | `DocumentService` bg finalize catch | S | error log after status=failed |
| BE | `conversationMemory` refresh (post-v14) | H | MemoryError rethrow + `refreshed` |
| FE | `ChunkPreview` / Profile / pdfFont | H/S | warn + UI fallback |
| FE | `api/chat` stream abort paths | H | rethrow |
| Desktop | `main` UI bind / createWindow | H | error + throw/quit |
| Desktop | `updater` check fail | S | emit error state |
| e2e | `.catch(() => false)` | T | out |

Any newly found empty catch, unlogged swallow, or wrong-success during inventory → promote to **G**.

---

## 7. Rollout

1. Complete inventory → commit appendix update to this spec (or `docs/superpowers/specs/2026-09-21-error-handling-inventory.md`).
2. Fix G sites BE → FE → desktop.
3. Gate: list of G all closed; `backend` / `frontend` / `desktop` tests green.

**PR:** one PR preferred; atomic commits per gap.

---

## 8. Open follow-ups (not this wave)

- Soft ESLint `no-empty` / custom swallow detector in CI.
- Broader coverage push / fail-fast soft-fail policy.
- Making nightly E2E fail when LLM unavailable (v14 P49 deferral).

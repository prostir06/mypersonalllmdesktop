# Perf baseline — v19

Current numbers are in **W5** below. The W4 table is the previous measurement on the same day.

- Date: 2026-11-07
- Before: `85c480c` (v19.2, tree before W4)
- After: `c974ea1` (v19-w4, spec 6.1–6.6)
- Environment: local Windows. Vite production build. API on `:5000` was down, so no live chat stream.
- Hardware: Intel Core i5-12400F

## S5 — bundle

Initial JS is the gzip sum of scripts referenced from `build/index.html` (same rule as `npm run check:bundle`, limit 350 KB). jspdf is not in that set.

| | Before `85c480c` | After `c974ea1` |
|--|------------------|-----------------|
| Initial JS | **123.15 KB** gzip, 8 files | **136.86 KB** gzip, 8 files |
| CSS referenced from `index.html` | 34.83 KB gzip | 35.36 KB gzip |
| Dashboard route chunk (lazy) | 27.80 KB gzip | 49.58 KB gzip |

`npm run check:bundle` on the after build: `Bundle budget OK: initial JS = 136.86 KB gzip across 8 files`.

The chat route grew with `react-virtuoso`. The initial shell grew by about 14 KB gzip and stays under the budget.

## Stream render — long reply with tools

Harness: `frontend/src/perf/streamRenderCost.test.tsx`. Forty paragraphs and four finished tool rows. React Profiler in jsdom, two runs on this machine.

The per-token path commits the whole reply through `ReactMarkdown` once per paragraph (the pre-6.1 shape). The batched path commits eight paragraphs at a time through `StreamingMarkdown` (tokens that arrive between animation frames).

| Path | Commits | Render time | Time until first paragraph |
|------|---------|-------------|----------------------------|
| Per-token | 41 | 145–162 ms | 28–36 ms |
| Batched | 6 | 16.5–18.7 ms | 4.0–4.2 ms |

Commit count is stable. The millisecond columns are those two runs.

## S1 — TTFT

No number. The app stack was not running, and a live provider is still required for the first SSE `token` frame. See `docs/perf-baseline-2026-09-21.md`. Server prep in spec 6.4 (parallel context loads, capped history) is not timed here.

## v19 W5

- Date: 2026-11-07
- Tree: `6915e09` (v19-w5, after the dependency and CI slices)
- Environment: local Windows. Vite production build. No live chat stream.
- Hardware: Intel Core i5-12400F

### Bundle

Same rule as `npm run check:bundle` (gzip of scripts referenced from `build/index.html`, limit 350 KB). jspdf is not in that set.

| | W4 `c974ea1` | W5 `6915e09` |
|--|----------------|----------------|
| Initial JS | 136.86 KB gzip, 8 files | **142.40 KB** gzip, 8 files |
| CSS referenced from `index.html` | 35.36 KB gzip | **36.35 KB** gzip |
| Dashboard route chunk (lazy) | 49.58 KB gzip | **49.58 KB** gzip |

`npm run check:bundle`: `Bundle budget OK: initial JS = 142.40 KB gzip across 8 files`.

The initial shell grew by about 5.5 KB gzip after the router upgrade and stays under the budget. The dashboard chunk is unchanged.

### Stream render — long reply with tools

Same harness: `frontend/src/perf/streamRenderCost.test.tsx`. Two runs.

| Path | Commits | Render time | Time until first paragraph |
|------|---------|-------------|----------------------------|
| Per-token | 41 | 121.0 ms, 126.0 ms | 32.3 ms, 31.1 ms |
| Batched | 6 | 16.2 ms, 13.3 ms | 3.5 ms, 3.6 ms |

### TTFT

No number. The stack was not running.

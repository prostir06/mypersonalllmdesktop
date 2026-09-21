# Perf baseline — SLI gate closeout (Docker)

- Date: 2026-09-21
- Commit SHA: `5c62f93` (+ local stack rebuild)
- Environment: **docker** (`docker compose up`; measurements via `docker compose exec backend` + host SSE to `:5000`)
- Hardware / compose limits: Windows host; backend 1 CPU / 1g; postgres healthy (no host DB port — queries in-container)
- Fixture: userId=66, conversationId=33 (**600** messages), documentId=14 (2 chunks, 768-d vectors + FTS)

## SLI results (post-P0 code)

| SLI | Label | ms | Notes |
|-----|-------|-----|-------|
| S1 | SSE `init` rag **off** | **55–304** | Prep proxy — first token unavailable (Ollama/OpenAI stream fail in this env) |
| S1 | SSE `init` rag **on** | **334–1227** | Same; RAG adds ~0.3–0.9s before `init` |
| S1 | TTFT (first `token`) | — | **Blocked** — providers return stream error after `init` |
| S2 | retrieve hybrid (cold) | **271** | First call in container; 2 chunks |
| S2 | retrieve hybrid (warm p50, n=5) | **3** | Hybrid vector∥FTS confirmed working |
| S3 | ollama batch N=8 (in Docker→host) | **17253** | 8/8 ok; slower than host-local 658ms (network / cold model) |
| S3 | ollama batch N=8 (host 2026-08-24) | **658** | Prior P0-3 gate (vs 3063 sequential) |
| S4 | loadRecentMessages N=600 | **20** cold / **5** warm p50 | Returns **50** provider msgs — raw cap working |

## P0 gate status

| ID | Code | SLI evidence | Verdict |
|----|------|--------------|---------|
| B0 | tooling | S2/S4 filled on Docker DB; S1 init proxy; S3 re-run | **Closed** (S1 first-token pending real LLM) |
| P0-1 vector∥FTS | shipped | S2 warm **3 ms**, cold **271 ms**, chunks=2 | **Confirmed** |
| P0-2 parallel prompts | shipped | S1 init rag-off down to **55 ms** (no RAG path) | **Plausible / soft-confirm** (no pre-P0 Docker init baseline) |
| P0-3 Ollama concurrency | shipped | Host before/after **3063→658**; Docker S3 slower due to path, not regression of code | **Confirmed** (host numbers) |
| P0-4 history raw cap | shipped | 600 raw → 50 provider msgs in **5–20 ms** | **Confirmed** |

## Gate notes

- Full S1 TTFT needs a working chat provider in the stack; use SSE `init` as prep SLI until then.
- Redis/BullMQ (P2-1) still not justified: S4 is cheap at N=600; S3 host concurrency already helped.
- Next: optional S1 with live Ollama/OpenAI; then P1 items ranked by remaining TTFT/RAG cost.

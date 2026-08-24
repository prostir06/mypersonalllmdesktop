# Perf baseline

- Date: 2026-08-24
- Branch: `feature/perf-p0`
- Environment: local
- Hardware / compose limits: Windows host; local Ollama; DB auth failed for compose URL in `.env`

## Before P0 (commit `ec2e791` tooling / pre-concurrency)

| SLI | Label | ms | Notes |
|-----|-------|-----|-------|
| S1 | TTFT | — | not measured |
| S2 | retrieve hybrid | skipped | DB `28P01` |
| S3 | ollama batch N=8 | **3063** | sequential; 8/8 ok |
| S3 | openai batch N=8 | ignore | placeholder key |
| S4 | loadRecentMessages | skipped | no `PERF_CONVERSATION_ID` |

## After P0

| Change | SLI | Before ms | After ms | Notes |
|--------|-----|-----------|----------|-------|
| P0-3 `OLLAMA_EMBED_CONCURRENCY=4` | S3 ollama N=8 | 3063 | **658** | ~4.6× |
| P0-1 vector∥FTS | S2 | — | — | DB unavailable this host |
| P0-2 parallel prompts | S1 | — | — | not timed separately |
| P0-4 history raw cap | S4 | — | — | needs conversation fixture |

## Gate notes

- S3 hypothesis confirmed: concurrent Ollama embeds dominate index throughput.
- S2/S4 need a working `DATABASE_URL` + `PERF_CONVERSATION_ID` for numeric before/after.
- Redis/BullMQ (P2-1) not justified yet from these numbers alone.

# Perf baseline

- Date: 2026-08-24
- Commit SHA: `1618b84` (branch `feature/perf-p0` start; numbers before P0 code)
- Environment: local
- Hardware / compose limits: Windows host; local Ollama; DB auth failed for compose URL in `.env`

| SLI | Label | ms (p50 or single) | Notes |
|-----|-------|--------------------|-------|
| S1 | TTFT rag on | — | not measured (manual) |
| S1 | TTFT rag off | — | not measured (manual) |
| S2 | retrieve hybrid | skipped | DB `28P01` password auth failed |
| S3 | ollama batch N=8 | **3063** | sequential embeds; 8/8 ok |
| S3 | openai batch N=8 | 777 | placeholder key → 0/8 ok (ignore) |
| S4 | loadRecentMessages | skipped | no `PERF_CONVERSATION_ID` |

## After changes

| Change | SLI | Before ms | After ms | Notes |
|--------|-----|-----------|----------|-------|
| | | | | |

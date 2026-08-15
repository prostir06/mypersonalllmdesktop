Status: done.
Commits: this Task 10 commit.
E2E: `cd e2e; E2E_BASE_URL=http://localhost:3000 npm test` -> 4 passed.
Added specs: login, rag-upload, conversation-query; kept smoke.
Also fixed dashboard query-param active conversation id comparison.
Concern: local `.env` has `VITE_API_URL=http://localhost:5000/api`, which CSP blocks; rebuilt Compose with `VITE_API_URL=/api` for E2E.
Report path: `.superpowers/sdd/task-10-report.md`

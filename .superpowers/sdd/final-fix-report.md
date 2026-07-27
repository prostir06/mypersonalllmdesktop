## Final Foundation Fix Report - 2026-07-27

- Prisma 7 URL binding: `schema.prisma` keeps Prisma 7-compatible datasource config; runtime now passes `DATABASE_URL` through `@prisma/adapter-pg` in `src/config/prisma.ts`.
- Auth hardening: replaced JWT_SECRET message matching with `JwtSecretMissingError`, normalized config-error responses for register/login/refresh, warmed dummy bcrypt hash at module load, and changed `auth.ts` to a single CJS-friendly `export = router`.
- Tests: extended JWT_SECRET-missing coverage for login and refresh.

Verification:
- `npx prisma generate` PASS
- `npx tsc --noEmit` PASS
- `npx jest src/__tests__/auth.test.ts --no-coverage` PASS
- `npm run build` PASS

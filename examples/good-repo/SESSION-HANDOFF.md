# SESSION-HANDOFF.md — example-service

> **Example** — Clear session handoff so agents can pick up exactly where the last session ended.

## Date
2026-06-05

## What was completed
- Added `src/utils/validate.ts` with Zod schema helpers
- Wired validation into `api/users.ts` POST and PATCH handlers
- All 142 tests passing after validation changes

## What is broken or unverified
- Nothing broken
- feat-012 (rate limiting) not yet started

## Next best step
- Feature: feat-012 — rate limiting middleware
- Start from: `src/api/users.ts` — add express-rate-limit to POST /users
- Pass when: `npm test` passes with rate limit tests added

## Must not change
- `src/db/` — schema is stable for this sprint
- Existing Zod schemas in `src/utils/validate.ts` — additive changes only

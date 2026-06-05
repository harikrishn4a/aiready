# CONSTRAINTS.md — example-service

> **Example** — Explicit MUST/MUST NOT rules for agents. Covers the most common failure modes.

## Hard rules — never violate these

- MUST NOT run `DROP TABLE` or `TRUNCATE` in production without a rollback migration ready and reviewed
- MUST NOT commit `.env` files, secrets, connection strings, or API keys
- MUST NOT modify existing migration files — migrations are append-only
- MUST NOT bypass the authentication middleware on any route that accesses user data
- MUST NOT call `db/client.ts` directly from `api/` layer — always go through `services/`
- MUST NOT introduce circular imports between modules
- MUST NOT add a dependency without recording the decision in `DECISIONS.md`
- MUST NOT claim a feature complete unless `npm test` passes with new tests covering the feature

## Required before each commit

- MUST run `npm run typecheck` — zero errors
- MUST run `npm test` — all tests passing
- MUST run `npm run lint` — clean output

## Database rules

- MUST wrap multi-table writes in a transaction
- MUST NOT use raw SQL strings — use Knex query builder
- MUST test with a local database before merging — integration tests use `DATABASE_URL`

## Security rules

- MUST validate all user input with Zod before processing
- MUST NOT log sensitive fields (passwords, tokens, PII) at any log level
- MUST use parameterised queries — never concatenate user input into SQL

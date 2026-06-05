# AGENTS.md — example-service

> **Example** — This is a well-harnessed example repo. It demonstrates high scores across all 5 AI readiness subsystems.

## What this is
A TypeScript REST API service that manages user accounts and permissions.
Built with Node.js 20+, Express, and PostgreSQL. Version 2.1.0.

## Stack
- Node.js 20+, TypeScript 5 (strict mode)
- Express 4 — HTTP routing
- PostgreSQL 15 — primary datastore
- Vitest — testing
- tsup — build bundler

## Repo structure
```
src/
  api/       ← Express route handlers, grouped by resource
  db/        ← Knex query builders and migration helpers
  services/  ← Business logic, no framework coupling
  utils/     ← Shared helpers (logging, errors, validation)
  cli.ts     ← CLI entrypoint for admin commands
tests/
migrations/  ← Timestamped SQL migration files
```

## Session start
1. Run `pwd` — confirm you are in the project root
2. Read `PROGRESS.md` for current task state
3. Read `SESSION-HANDOFF.md` for what was left unfinished
4. Run `npm run build && npm test` to confirm baseline passes
5. Read `ARCHITECTURE.md` before touching `src/db/`

## Verification commands
```bash
npm run build
npm run typecheck
npm run lint
npm test
npm run migrate:latest
```

## Constraints — never do these
- MUST NOT run `DROP TABLE` or `TRUNCATE` without a rollback migration ready
- MUST NOT commit secrets, API keys, or connection strings to source control
- MUST NOT modify existing migration files — create a new migration instead
- MUST run `npm run typecheck` before claiming any TypeScript change is complete
- MUST NOT bypass authentication middleware in production routes
- MUST get explicit confirmation before running destructive operations on the database

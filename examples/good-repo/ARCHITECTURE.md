# ARCHITECTURE.md — example-service

> **Example** — A detailed architecture document with annotated module map. Scores 100 on the memory subsystem.

## Overview
Three-layer REST API: HTTP handlers → service layer → database layer.
No business logic in route handlers. No database access outside `src/db/`.

## Module map
```
src/
  cli.ts          ← Admin CLI entrypoint (Commander). Not loaded in HTTP server.

  api/
    users.ts      ← GET/POST /users, GET/PATCH/DELETE /users/:id
    permissions.ts ← GET/POST /permissions, permission check middleware
    health.ts     ← GET /health — liveness and readiness probes

  services/
    user.ts       ← User create/update/delete, password hashing
    permission.ts ← Permission evaluation logic, role resolution
    email.ts      ← Email notifications (sends via SES, no direct DB access)

  db/
    client.ts     ← Knex instance, exported singleton
    users.ts      ← users table queries (no joins — use service layer)
    permissions.ts ← permissions + roles tables

  utils/
    logger.ts     ← Winston structured logger, request ID injection
    errors.ts     ← AppError class, Express error middleware
    validate.ts   ← Zod schema wrappers, input sanitisation helpers
```

## Data flow
```
HTTP request
    ↓
api/         validates input, calls service
    ↓
services/    applies business rules, calls db
    ↓
db/          executes SQL via Knex
    ↓
PostgreSQL
```

## Key invariants
- Services never call `db/client.ts` directly — they call the module-specific db files
- No `req`/`res` objects outside `api/` layer
- All database queries go through transaction wrappers when modifying multiple tables
- Migrations are append-only — never modify an already-run migration file

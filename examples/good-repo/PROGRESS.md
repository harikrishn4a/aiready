# PROGRESS.md — example-service

> **Example** — Structured progress tracking. Updated frequently so agents can resume without starting blind.

## Current state
- Build: passing
- Tests: 142/142 passing
- Typecheck: clean
- Last verified: 2026-06-05
- Active feature: feat-012 — rate limiting middleware

## Completed
- [x] **feat-001** — Project scaffold, CI pipeline
- [x] **feat-002** — User CRUD (create, read, update, delete)
- [x] **feat-003** — JWT authentication middleware
- [x] **feat-004** — Permission system (roles + ACL)
- [x] **feat-005** — Email notification service
- [x] **feat-006** — Pagination for list endpoints
- [x] **feat-007** — Request logging with correlation IDs
- [x] **feat-008** — Database connection pooling
- [x] **feat-009** — Input validation with Zod schemas
- [x] **feat-010** — Health check endpoint with DB ping
- [x] **feat-011** — Soft delete for user accounts

## In progress
- [ ] **feat-012** — Rate limiting: per-user limits on POST /users and auth endpoints

## Blocked
- nothing

## Backlog
- feat-013: Webhook delivery system
- feat-014: Audit log table + query endpoint
- feat-015: Admin impersonation flow

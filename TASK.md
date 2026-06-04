# TASK.md — Sprint Contract

## Feature
- ID: feat-004
- Title: Audit reporter — terminal and JSON output + wire-up

## Scope — what will change
- src/audit/reporter.ts (new) — formats terminal and JSON output
- src/audit/index.ts (replace stub) — audit command handler
- src/cli.ts (update) — wire audit command to real handler
- tests/reporter.test.ts (new) — unit tests

## Exclusions — what will NOT change
- No scorer or loader changes
- No cross-ref changes

## Verification standard
- npm run build
- npm test
- npm run typecheck
- npm run lint
- node dist/cli.js audit --target . produces terminal output with 5 subsystem scores

## Acceptance criteria
- Terminal output shows overall score, 5 subsystem bars, gaps, recommendation
- --json flag outputs parseable JSON matching the spec in ARCHITECTURE.md
- --target option defaults to . (cwd)
- --min-score option defaults to 70; exits 1 when score is below threshold

## Invariants — must remain true throughout
- reporter.ts must only format and print — no business logic
- cli.ts must not contain scoring or file reading logic
- existing 61 tests continue to pass

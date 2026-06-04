# TASK.md — Sprint Contract

## Feature
- ID: feat-003
- Title: Audit cross-ref — validate docs vs project reality

## Scope — what will change
- src/audit/cross-ref.ts (new)
- tests/cross-ref.test.ts (new)

## Exclusions — what will NOT change
- src/audit/index.ts — stays as stub
- src/cli.ts — no changes
- No output logic

## Verification standard
- npm run build
- npm test
- npm run typecheck
- npm run lint

## Acceptance criteria
- crossRef(files) returns CrossRefResult with named checks
- Checks: npm commands in AGENTS.md exist in package.json scripts
- Checks: modules in ARCHITECTURE.md match actual src/ directories
- Checks: PROGRESS.md last-modified within 7 days
- Each check has passed: boolean and detail: string

## Invariants — must remain true throughout
- cross-ref.ts must only validate — no scoring, no output
- cross-ref.ts must not modify any file

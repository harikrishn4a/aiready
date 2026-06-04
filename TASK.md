# TASK.md — Sprint Contract

## Feature
- ID: feat-002
- Title: Audit scorer — score 5 subsystems

## Scope — what will change
- src/audit/scorer.ts (new) — pure scoring function, no filesystem reads
- tests/scorer.test.ts (new) — unit tests for each subsystem

## Exclusions — what will NOT change
- src/audit/index.ts — stays as stub
- src/cli.ts — no changes
- No output, no cross-ref logic

## Verification standard
- npm run build
- npm test
- npm run typecheck
- npm run lint

## Acceptance criteria
- scoreRepo(files) returns ScoredResult with 5 subsystem scores + overall
- Each subsystem scores 0–100
- Well-harnessed input scores > 70 overall
- Empty/missing input scores 0 overall
- scorer is pure — same input always produces same output

## Invariants — must remain true throughout
- scorer.ts must not read from filesystem
- scorer.ts must not make network requests
- scorer.ts must not import from loader.ts (uses RepoFiles type only)

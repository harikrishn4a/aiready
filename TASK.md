# TASK.md — Sprint Contract

## Feature
- ID: feat-001
- Title: Audit loader — read target repo files into memory

## Scope — what will change
- src/utils/fs.ts (new) — filesystem helpers
- src/utils/detect.ts (new) — stub: package manager detection
- src/audit/loader.ts (new) — reads target repo into RepoFiles struct
- tests/loader.test.ts (new) — unit tests

## Exclusions — what will NOT change
- src/audit/index.ts — stays as stub
- src/cli.ts — no changes
- No scoring, output, or cross-ref logic

## Verification standard
- npm run build
- npm test (includes loader tests)
- npm run typecheck
- npm run lint

## Acceptance criteria
- loadRepo(dir) returns typed RepoFiles struct
- Missing files return null, not throw
- package.json parsed as object; malformed returns null
- srcDirs lists subdirectories under src/

## Invariants — must remain true throughout
- loader.ts must only read files — no scoring, no output
- loader.ts must not write to any directory

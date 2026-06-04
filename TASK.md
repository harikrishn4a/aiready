# TASK.md — Sprint Contract

## Feature
- ID: feat-000
- Title: Project scaffold

## Scope — what will change
- package.json, tsconfig.json, tsup.config.ts, eslint.config.js, vitest.config.ts
- src/cli.ts — Commander entrypoint with audit command stub
- src/audit/, src/init/, src/analyze/, src/drift/, src/fix/ — empty index.ts stubs
- tests/cli.test.ts — smoke test
- feature_list.json, features.md — created from PROGRESS.md backlog

## Exclusions — what will NOT change
- No Stage 1 audit logic
- No scoring, loading, or reporting code
- AGENTS.md, ARCHITECTURE.md, DECISIONS.md not modified

## Files expected to change
- package.json (new)
- tsconfig.json (new)
- tsup.config.ts (new)
- eslint.config.js (new)
- vitest.config.ts (new)
- src/cli.ts (new)
- src/audit/index.ts (new)
- src/init/index.ts (new)
- src/analyze/index.ts (new)
- src/drift/index.ts (new)
- src/fix/index.ts (new)
- tests/cli.test.ts (new)
- feature_list.json (new)
- features.md (new)
- PROGRESS.md (update)
- SESSION-HANDOFF.md (create)

## Verification standard
- npm run build — zero errors, dist/cli.js emitted
- npm test — all tests pass
- npm run typecheck — zero type errors
- npm run lint — clean

## Acceptance criteria
- `npm run build && npm test` passes on empty codebase
- CLI binary exists at dist/cli.js
- `node dist/cli.js --version` prints 0.1.0

## Invariants — must remain true throughout
- No Stage 2+ code written
- No LLM dependencies added
- examples/ directory not modified

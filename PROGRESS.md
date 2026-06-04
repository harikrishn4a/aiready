# PROGRESS.md — AIReady

## Current state
- Build: passing — dist/cli.js emitted, 1.44 KB
- Tests: 2/2 passing (tests/cli.test.ts)
- Typecheck: clean
- Lint: clean
- Last verified: 2026-06-04
- Active feature: none — scaffold complete, next is feat-001 (audit loader)

## Completed
- [x] Product design and stage definitions
- [x] AGENTS.md
- [x] ARCHITECTURE.md
- [x] DECISIONS.md
- [x] PROGRESS.md
- [x] Example harness templates in examples/
- [x] **feat-000: Project scaffold** — npm run build && npm test passing

## In progress
- nothing — scaffold complete, ready to start Stage 1 core

## Blocked
- nothing currently

## Backlog — Stage 1

### Scaffolding
- [x] package.json with all scripts: build, typecheck, lint, test
- [x] tsconfig.json (strict, NodeNext)
- [x] eslint.config.js (typescript-eslint recommended)
- [x] vitest.config.ts
- [x] tsup.config.ts (cjs, dts, clean)
- [x] src/cli.ts — Commander entrypoint, audit command stub
- [x] Stub directories: src/audit/, src/init/, src/analyze/, src/drift/, src/fix/
- [x] tests/cli.test.ts — smoke test (2 passing)
- [x] feature_list.json — created, feat-000 marked passing
- [x] features.md — created with all Stage 1 features defined

### Stage 1 core
- [ ] src/audit/loader.ts — reads target repo files into memory
- [ ] src/audit/scorer.ts — scores 5 subsystems
- [ ] src/audit/cross-ref.ts — validates docs vs project files
- [ ] src/audit/reporter.ts — terminal and JSON output
- [ ] src/utils/fs.ts — filesystem helpers
- [ ] src/utils/detect.ts — stack and package manager detection
- [ ] tests/ — unit tests for scorer and cross-ref

### Stage 1 verification
- [ ] `npx aiready audit` runs against examples/good-repo and returns score > 70
- [ ] `npx aiready audit` runs against examples/bare-repo and returns score < 30
- [ ] `npx aiready audit --json` outputs valid JSON
- [ ] `npx aiready audit --min-score 80` exits with code 1 when score is below threshold

## Backlog — Stage 2+
- Stage 2: init command (LLM-assisted generation)
- Stage 3: analyze command (semantic gap analysis)
- Stage 4: drift command (stale docs detection)
- Stage 5: fix command (auto-remediation)
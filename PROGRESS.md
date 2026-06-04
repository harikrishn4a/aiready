# PROGRESS.md — AIReady

## Current state
- Build: passing — dist/cli.js 15.49 KB (full pipeline bundled)
- Tests: 89/89 passing (6 test files)
- Typecheck: clean
- Lint: clean
- Last verified: 2026-06-04
- Active feature: none — **Stage 1 complete**

## Completed
- [x] Product design and stage definitions
- [x] AGENTS.md, ARCHITECTURE.md, DECISIONS.md
- [x] Example harness templates in examples/
- [x] **feat-000** — Project scaffold (build/test/typecheck/lint all passing)
- [x] **feat-001** — Audit loader: loadRepo() reads target repo into typed RepoFiles struct
- [x] **feat-002** — Audit scorer: scoreRepo() scores 5 subsystems, content-aware heuristics
- [x] **feat-003** — Cross-ref: validates commands in AGENTS.md vs package.json, modules vs src/
- [x] **feat-004** — Reporter: terminal bar-chart output + JSON mode; audit pipeline wired end-to-end
- [x] **feat-005** — Integration: good-repo scores 100/100, bare-repo scores 0/100, all CLI flags verified

## In progress
- nothing — Stage 1 complete

## Blocked
- nothing

## Backlog — Stage 1

### Scaffolding — DONE
- [x] package.json, tsconfig.json, eslint.config.js, vitest.config.ts, tsup.config.ts
- [x] src/cli.ts — Commander with audit command, --target/--json/--min-score options
- [x] Stub directories: src/audit/, src/init/, src/analyze/, src/drift/, src/fix/
- [x] feature_list.json, features.md

### Stage 1 core — DONE
- [x] src/audit/loader.ts — reads target repo files into memory
- [x] src/audit/scorer.ts — scores 5 subsystems
- [x] src/audit/cross-ref.ts — validates docs vs project files
- [x] src/audit/reporter.ts — terminal and JSON output
- [x] src/utils/fs.ts — filesystem helpers
- [x] src/utils/detect.ts — package manager detection (stub, used in Stage 2+)
- [x] 89 tests across 6 test files

### Stage 1 verification — DONE
- [x] `npx aiready audit --target test-fixtures/good-repo` scores 100/100 (> 70) ✓
- [x] `npx aiready audit --target test-fixtures/bare-repo` scores 0/100 (< 30) ✓
- [x] `npx aiready audit --json` outputs valid JSON with expected schema ✓
- [x] `npx aiready audit --min-score 80` exits with code 1 when score is below threshold ✓

## Backlog — Stage 2+
- Stage 2: init command (LLM-assisted generation)
- Stage 3: analyze command (semantic gap analysis)
- Stage 4: drift command (stale docs detection)
- Stage 5: fix command (auto-remediation)
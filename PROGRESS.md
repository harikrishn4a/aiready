# PROGRESS.md — AIReady

## Current state
- Build: not yet set up
- Tests: not yet set up
- Last verified: —
- Active feature: none — scaffolding phase

## Completed
- [x] Product design and stage definitions
- [x] AGENTS.md
- [x] ARCHITECTURE.md
- [x] DECISIONS.md
- [x] PROGRESS.md
- [x] Example harness templates in examples/

## In progress
- [ ] Project scaffolding — package.json, tsconfig, eslint, vitest config

## Blocked
- nothing currently

## Backlog — Stage 1

### Scaffolding
- [ ] package.json with all scripts: build, typecheck, lint, test
- [ ] tsconfig.json (strict)
- [ ] eslint config
- [ ] vitest config
- [ ] tsup config
- [ ] src/cli.ts — Commander entrypoint, registers audit command skeleton
- [ ] Stub directories: src/init/, src/analyze/, src/drift/, src/fix/

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
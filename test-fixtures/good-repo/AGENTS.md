# AGENTS.md — Example Well-Harnessed Repo

## What this is
A well-harnessed example repository used as a fixture for testing AIReady's audit command.
This project demonstrates a complete harness setup with all five subsystems covered.
Version v1.0.0 — demonstrates correct harness structure for AI agent tooling.

## Stack
- Node.js 20+, TypeScript (strict)
- Commander.js — CLI framework
- Vitest — testing
- tsup — build

## Repo structure
```
src/
  audit/        ← Stage 1: scoring
  utils/        ← shared helpers
```

## Session start
1. Run `pwd`
2. Read this file
3. Run `npm run build && npm test`

## Session end
1. Run full verification
2. Update PROGRESS.md
3. Commit

## Verification commands
```bash
npm run build
npm run typecheck
npm run lint
npm test
```

## Working rules
- One feature at a time
- Do not claim completion without evidence

## Constraints — never do these
- MUST NOT modify files without user confirmation
- MUST NOT add dependencies without recording the decision
- MUST NOT claim completion without runnable evidence
- MUST run verification before marking a feature done

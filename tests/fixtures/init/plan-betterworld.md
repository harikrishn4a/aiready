# AIReady Plan
Generated: 2026-06-05T11:15:22.226Z
Target: /test/betterworld
Overall: 33/100

## SUBSYSTEM SCORES
- identity: 47
- verification: 31
- state: 53
- memory: 23
- constraints: 12

## SUBSYSTEM SOURCES
- identity: AGENTS.md, CLAUDE.md
- verification: AGENTS.md
- state: PROGRESS.md, SESSION-HANDOFF.md, change_logs/CHECKPOINT_1_BACKEND_IMPLEMENTATION.md
- memory: AGENTS.md, ARCHITECTURE.md, DECISIONS.md
- constraints: CONSTRAINTS.md

## GENERATE
(none)

## IMPROVE
### CONSTRAINTS.md
- subsystem: constraints
- section: hard constraints
- missing: CONSTRAINTS.md is empty
- fix: Update hard constraints using examples/constraints.md
- source_files: CONSTRAINTS.md

### ARCHITECTURE.md
- subsystem: memory
- section: module map
- missing: ARCHITECTURE.md is empty
- fix: Update module map using examples/architecture.md
- source_files: AGENTS.md, ARCHITECTURE.md, DECISIONS.md

## SKIP
- AGENTS.md (47/100) — score 47/100 — below threshold but listed skip for test
- PROGRESS.md (53/100) — score 53/100 — already documented
- DECISIONS.md — no subsystem score — file exists

## SOURCE CONTEXT
### CLAUDE.md
- subsystems: identity, constraints
- reason: Useful context outside canonical artifact

### plan.md
- subsystems: memory, constraints
- reason: Useful context outside canonical artifact

### change_logs/CHECKPOINT_1_BACKEND_IMPLEMENTATION.md
- subsystems: state, memory
- reason: Useful checkpoint context

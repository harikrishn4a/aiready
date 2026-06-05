# AIReady Plan
Generated: 2026-06-05T08:00:00.000Z
Target: /test/repo
Overall: 55/100

## SUBSYSTEM SCORES
- identity: 90
- verification: 45
- state: 45
- memory: 55
- constraints: 0

## SUBSYSTEM SOURCES
- identity: AGENTS.md
- verification: AGENTS.md, package.json
- state: PROGRESS.md
- memory: 
- constraints: 

## GENERATE

### CONSTRAINTS.md
- subsystem: constraints
- template: examples/constraints.md
- source_files: package.json
- required: MUST/MUST NOT language, domain-specific rules

## IMPROVE

### PROGRESS.md
- subsystem: state
- section: current state
- missing: incomplete status
- fix: update all status sections
- source_files: package.json

## SOURCE CONTEXT

(none)

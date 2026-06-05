# AIReady Plan
Generated: 2026-06-05T08:00:00.000Z
Target: /test/repo
Overall: 45/100

## GENERATE
### PROGRESS.md
- subsystem: state
- template: examples/progress.md
- source_files: package.json
- required: current build status, completed/in-progress/blocked tasks, next step

### CONSTRAINTS.md
- subsystem: constraints
- template: examples/constraints.md
- source_files: CLAUDE.md
- required: MUST/MUST NOT language, domain-specific rules

## IMPROVE
### CLAUDE.md
- section: verification
- missing: commands not cross-referenced against package.json
- fix: add typecheck to package.json scripts or remove from CLAUDE.md
- source_files: package.json

## SOURCE CONTEXT
### plan.md
- subsystem: state
- reason: useful context but not a canonical artifact

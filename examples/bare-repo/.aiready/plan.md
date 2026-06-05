# AIReady Plan
Generated: 2026-06-05T00:00:00.000Z
Target: examples/bare-repo
Overall: 5/100

## GENERATE

### AGENTS.md
- subsystem: identity
- template: examples/agents.md
- source_files: README.md, package.json
- required: project description, stack with versions, verification commands, repo structure

### PROGRESS.md
- subsystem: state
- template: examples/progress.md
- source_files: package.json
- required: current build status, completed tasks, in progress, blocked

### ARCHITECTURE.md
- subsystem: memory
- template: examples/architecture.md
- source_files: package.json
- required: module map, module responsibilities, data flow

### CONSTRAINTS.md
- subsystem: constraints
- template: examples/constraints.md
- source_files: package.json
- required: MUST NOT language, forbidden actions, domain rules

## IMPROVE

(none)

## SOURCE CONTEXT

(none)

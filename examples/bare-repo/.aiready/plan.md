# AIReady Plan
Generated: 2026-06-05T00:00:00.000Z
Target: examples/bare-repo
Overall: 5/100

## Summary
- Missing: AGENTS.md, PROGRESS.md + SESSION-HANDOFF.md, ARCHITECTURE.md, CONSTRAINTS.md
- Weak: none
- Source context: none

## Missing Artifacts
### AGENTS.md
- why: No file was mapped to the identity subsystem.
- template: examples/agents.md
- subsystem: identity
- max_lines: 300
- required_sections: project description, stack with versions, verification commands, repo structure
- source_signals: README.md, package.json
- write_policy:
  - create only if missing
  - do not overwrite an existing user file without --force
  - keep artifact under 300 lines

### PROGRESS.md
- why: No file was mapped to the state subsystem.
- template: examples/progress.md
- subsystem: state
- max_lines: 300
- required_sections: current build status, completed tasks, in progress, blocked
- source_signals: package.json
- write_policy:
  - create only if missing
  - keep artifact under 300 lines

### ARCHITECTURE.md
- why: No file was mapped to the memory subsystem.
- template: examples/architecture.md
- subsystem: memory
- max_lines: 300
- required_sections: module map, module responsibilities, data flow
- source_signals: src/ directory structure, package.json
- write_policy:
  - create only if missing
  - keep artifact under 300 lines

### CONSTRAINTS.md
- why: No file was mapped to the constraints subsystem.
- template: examples/constraints.md
- subsystem: constraints
- max_lines: 300
- required_sections: MUST NOT language, forbidden actions, domain rules
- source_signals: package.json
- write_policy:
  - create only if missing
  - keep artifact under 300 lines

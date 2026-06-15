# STRUCTURE.md

How harness artifacts are organised in this repository.

```
aiready/
├── AGENTS.md              # Entry point: project overview, session protocol, constraints
├── feature_list.json      # Machine-readable feature tracker (root)
├── package.json
├── src/                   # CLI source
├── tests/
├── examples/              # Harness templates (shipped in npm package)
└── docs/
    ├── ARCHITECTURE.md    # Stage design, module map, layer boundaries
    ├── DECISIONS.md       # Design decision log with rationale
    ├── PROGRESS.md        # Project state: done, in-progress, blocked
    ├── SESSION-HANDOFF.md # End-of-session state (overwritten each session)
    ├── TASK.md            # Sprint contract for the active feature
    ├── features.md        # Feature definitions and task breakdown
    └── structure.md       # This file
```

## Ownership

| File | Human | Agent |
|---|---|---|
| AGENTS.md | author, update when conventions change | read only |
| docs/ARCHITECTURE.md | author | read, update when structure changes |
| docs/DECISIONS.md | review | append new decisions |
| docs/PROGRESS.md | author, update milestones | update status each session |
| docs/SESSION-HANDOFF.md | read at session start | overwrite at session end |
| docs/TASK.md | review, approve scope | generate before each feature |
| docs/features.md | seed initial definitions | check off tasks, add notes |
| feature_list.json | — | full ownership, status + evidence |
| docs/structure.md | author | read only |

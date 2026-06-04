> **Example** — Adapt the file tree and ownership table to match the actual project's layout and artifact names.

# STRUCTURE.md

How artifacts are organised in this repository.

```
project/
├── AGENTS.md              # Entry point: project overview, commands, constraints reference
├── CONSTRAINTS.md         # Hard limits — MUST / MUST NOT language only
├── ARCHITECTURE.md        # Module map, layer responsibilities, key dependencies
├── DECISIONS.md           # Design decision log with rationale
├── PROGRESS.md            # Human-maintained project state: done, in-progress, blocked
├── SESSION-HANDOFF.md     # Agent-written end-of-session state, overwritten each session
├── TASK.md                # Sprint contract for current active feature, agent-generated
├── features.md            # Feature definitions and task breakdown — human seeds, agent maintains
├── feature_list.json      # Machine-readable feature tracker — agent maintains status + evidence
├── QUALITY.md             # Live quality snapshot per domain and layer — agent updates
├── QUALITY-DOCUMENT.md    # Grading scale reference (stable, rarely changes)
├── init.sh                # Standard startup and verification path
├── Makefile               # Standardized commands: setup, test, lint, check
└── src/
    └── {{MODULE}}/
        └── ARCHITECTURE.md  # Module-level boundaries and responsibilities
```

## Ownership

| File | Human | Agent |
|---|---|---|
| AGENTS.md | author, update when conventions change | read only |
| CONSTRAINTS.md | author, update when limits change | read only |
| ARCHITECTURE.md | author | read, add notes |
| DECISIONS.md | review | append new decisions |
| PROGRESS.md | author, update milestones | update status each session |
| SESSION-HANDOFF.md | read at session start | overwrite at session end |
| TASK.md | review, approve scope | generate before each feature |
| features.md | seed initial definitions | check off tasks, add notes |
| feature_list.json | — | full ownership, status + evidence |
| QUALITY.md | review | update each session |
| QUALITY-DOCUMENT.md | author | read only |
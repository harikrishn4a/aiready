# Examples

Reference artifacts for a well-harnessed repository. When generating harness files for a new project, read these to understand structure and flow, then produce project-specific versions.

**Read `templates.md` first** — it lists every artifact, its purpose, and who updates it.

## How to use

1. Read `templates.md` for the complete file inventory and update ownership table
2. Read the relevant example files to understand structure, sections, and tone
3. Replace `{{PLACEHOLDERS}}` with real project-specific content
4. Adapt `Makefile` and `scripts/` to the project's actual stack and package manager
5. Remove example data (like the pagination example in `progress.md`) — generate from scratch

## What the files are

| File | What it shows |
|---|---|
| `agents.md` | Session start/end protocol and working rules |
| `constraints.md` | Hard limits in MUST / MUST NOT language |
| `architecture.md` | Module-level boundary document |
| `decisions.md` | Decision log format with a filled example entry |
| `progress.md` | Project state snapshot with real-looking content |
| `session-handoff.md` | End-of-session state written by the agent |
| `task.md` | Sprint contract generated before each feature |
| `features.md` | Feature spec format — human seeds, agent maintains |
| `feature-list.json` | Machine-readable feature tracker |
| `quality.md` | Live quality snapshot per domain and layer |
| `quality-document.md` | Grading scale reference |
| `startup.md` | Quick-reference command table |
| `evaluator_rubric.md` | Post-implementation acceptance rubric |
| `clean-state-checklist.md` | End-of-session checklist |
| `structure.md` | Full artifact map with ownership table |
| `Makefile` | Standardized make targets with inline adaptation notes |
| `scripts/init.sh` | Session startup script |
| `scripts/verify.sh` | Verification script |

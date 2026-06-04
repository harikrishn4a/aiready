# Examples

Reference templates showing the structure and flow of a well-harnessed repository.

## How to use these

These files are examples — not copy-paste templates. When generating harness
artifacts for a real project, an LLM should:

1. Read these files to understand the **structure, sections, and flow**
2. Generate new versions that match the **actual project's stack and context**
3. Replace `{{PLACEHOLDERS}}` with real project-specific content
4. Adapt scripts to use the project's actual package manager and toolchain

## What each file is for

| File | Generated once | Updated by |
|---|---|---|
| `agents.md` | ✓ | Human (when conventions change) |
| `constraints.md` | ✓ | Human (when limits change) |
| `architecture.md` | ✓ | Agent (adds notes over time) |
| `decisions.md` | ✓ | Agent (appends new decisions) |
| `progress.md` | ✓ | Human + Agent |
| `session-handoff.md` | Each session | Agent (overwrites every session) |
| `task.md` | Each feature | Agent (overwrites per feature) |
| `features.md` | ✓ | Human seeds, Agent maintains |
| `feature-list.json` | ✓ | Agent (owns status + evidence) |
| `quality.md` | ✓ | Agent (updates each session) |
| `quality-document.md` | ✓ | Human (grading scale, rarely changes) |
| `scripts/init.sh` | ✓ | Human (adapt to stack) |
| `scripts/verify.sh` | ✓ | Human (adapt to stack) |

## Scripts

`init.sh` and `verify.sh` show the **flow** that every project needs:
- `init.sh`: install dependencies → run verify.sh
- `verify.sh`: build → typecheck → lint → test

The specific commands inside them must be replaced with your stack's equivalents.
The structure and order should stay the same.
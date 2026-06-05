# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-012 complete** — Stage 2 `npx aiready init` command
- **AGENTS.md + ARCHITECTURE.md updated** (from session start carry-over) — Stage 1 marked complete, Stage 2 marked current, full module map, LLM-powered pipeline documented

### feat-012 changes

#### New files
- `src/init/parser.ts` — parses `.aiready/plan.md` into `InitPlan` (generate + improve items)
- `src/init/generator.ts` — generates new artifact from template + source context (1 LLM call); resolves templates via `__dirname`
- `src/init/improver.ts` — improves a specific section of an existing file (1 LLM call); reads file fresh from disk
- `src/init/executor.ts` — write lifecycle: skip/force/write logic, step labels, `InitFlags` interface
- `src/init/scorer.ts` — lightweight re-audit: reuses `loadRepo` + `mapFiles` + `scoreRepo`, returns `overall`
- `tests/init-parser.test.ts` — 20 tests covering all `parsePlan` cases
- `tests/init-executor.test.ts` — 9 tests covering skip, force, write, and improve lifecycle
- `examples/bare-repo/.aiready/plan.md` — sample plan.md for dry-run smoke tests

#### Modified files
- `src/init/index.ts` — replaced stub: dry-run path, normal path (provider selection, sequential execute, re-score, score delta, tokens used)
- `src/cli.ts` — registered `init` command with `--target`, `--provider`, `--model`, `--force [filename]`, `--dry-run`
- `src/audit/remediation.ts` — added `- subsystem:` field to improve item rendering so parser can extract it
- `TASK.md`, `PROGRESS.md`, `feature_list.json` — updated for feat-012
- `ARCHITECTURE.md`, `AGENTS.md` — updated to reflect Stage 2 current status

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 65.64 KB, zero errors |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `npm test` | pass — 191/191 (14 test files) |
| `node dist/cli.js init --target ./examples/bare-repo --dry-run` | pass — shows 4 items correctly |

## What is broken or unverified
- Live LLM smoke tests not run: no API key in shell.
- `getAuditScore` in `init/scorer.ts` runs the full mapper + scorer pipeline; in practice this doubles the token cost of `init`. A future optimisation could cache the scored result or use a cheaper re-score.

## Manual smoke test (requires .env or exported key)
```bash
# Stage 2 normal run — generates missing artifacts in bare-repo
node dist/cli.js init --target ./examples/bare-repo --provider anthropic --model claude-haiku-4-5-20251001

# Confirm:
# - Each artifact written separately with [N/M] counter
# - Score before/after shown at end
# - Tokens used shown
# - Re-running shows "Nothing to do" if all files now exist

# Test --force for single file
node dist/cli.js init --target ./examples/bare-repo --force AGENTS.md --provider anthropic --model claude-haiku-4-5-20251001

# Test --dry-run
node dist/cli.js init --target ./examples/bare-repo --dry-run
```

## Next best step
- Feature: Stage 3 — `npx aiready analyze`
- Start from: reads source code + Graphify graph (if present), identifies undocumented intent, writes `.aiready/gaps.md`
- Pass when: `npx aiready analyze --target <repo>` produces a structured gaps file with at least module-level gap entries

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `loadRepo()` remains synchronous
- Stage 3 must not be started until Stage 2 is stable

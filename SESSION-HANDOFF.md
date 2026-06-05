# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-016 complete** — Audit plan source cleanup

### feat-016 changes

#### New files
- none

#### Modified files
- `src/audit/remediation.ts` — SOURCE CONTEXT is deduped by path with combined subsystems; GENERATE/IMPROVE `source_files` prefer non-empty candidate files; empty canonical stubs are not used as their own source context; PROGRESS.md and SESSION-HANDOFF.md fix text is artifact-specific.
- `tests/remediation.test.ts` — regression tests for SOURCE CONTEXT dedupe, non-empty source selection, and separate PROGRESS.md / SESSION-HANDOFF.md guidance.
- `TASK.md`, `PROGRESS.md`, `feature_list.json`, `DECISIONS.md`, `ARCHITECTURE.MD` — updated for feat-016.

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 82.71 KB, zero errors |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `npm test` | pass — 228/228 (17 test files) |

## What is broken or unverified
- Live LLM smoke tests not run: no API key in shell.
- Live audit on the user's external repo was not rerun in this session.
- Init executor behavior for empty improve targets is intentionally deferred to the next session.

## Manual smoke test (requires .env or exported key)
```bash
# Audit a repo with empty canonical files (expect empty stubs in IMPROVE, useful source_files from non-empty context)
node dist/cli.js audit --target ./examples/bare-repo --provider anthropic --model claude-haiku-4-5-20251001

# Verify plan.md SOURCE CONTEXT has one block per path
rg "### plan.md|subsystems:" ./examples/bare-repo/.aiready/plan.md
```

## Next best step
- Feature: Stage 2 init executor follow-up
- Start from: if an `improve` target exists but its file content is empty, treat it like `generate` and use the audit plan's non-canonical source files as context
- Pass when: `npx aiready init --target <repo>` fills empty canonical stubs from useful source context without requiring `--force`

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `loadRepo()` remains synchronous
- `parser.ts` is kept for backward compatibility; `planner.ts` is the new canonical interface

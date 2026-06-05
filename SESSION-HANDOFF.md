# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-011 complete** — Graphify semantic query, strict scoring, content-aware subsystem mapping, agent remediation plan, readable CLI output, opt-in score failure, and sea-green spinner

### feat-011 changes

#### New files
- `src/audit/remediation.ts` — typed remediation contract (`generate`, `improve`, `source_context`), examples template references, `max_lines: 300`, markdown renderer, `.aiready/plan.md` writer
- `src/utils/spinner.ts` — Claude-style sea-green TTY-only spinner disabled for JSON/CI
- `tests/remediation.test.ts` — 11 tests
- `tests/spinner.test.ts` — 2 tests

#### Modified files
- `src/audit/loader.ts` — guaranteed harness filenames, semantic Graphify node-label matching via `SUBSYSTEM_CONCEPTS`, dedupe, `MAX_CONTENT_CHARS = 6000`, metadata (`graphifyPath`, `guaranteedFiles`, `conceptMatchedFiles`)
- `src/audit/mapper.ts` — 5-line preview triage restored, 50-line preview classification retained; Graphify-selected files skip triage; full-content signals add mappings for all five subsystems
- `src/audit/scorer.ts` — strict course-aligned scoring prompt; `findings` shape added while preserving `gaps`; subsystem content can be scored as files or sections
- `src/audit/reporter.ts` — readable multi-line terminal output; JSON includes `remediation` and optional `plan_path`
- `src/audit/index.ts` — builds remediation plan, writes `.aiready/plan.md`, wraps LLM phases in spinner, exits nonzero only when `--min-score` is provided and failed
- `TASK.md`, `PROGRESS.md`, `features.md`, `feature_list.json`, `DECISIONS.md` — updated for feat-011

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 52.42 KB, zero errors |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `npm test` | pass — 162/162 (12 test files) |

## What is broken or unverified
- Manual live smoke tests were not run because neither `ANTHROPIC_API_KEY` nor `OPENAI_API_KEY` was present in the shell.
- Graphify semantic matching is covered by synthetic tests, not a real Graphify output from a production repo.

## Manual smoke test (requires .env or exported key)
```bash
node dist/cli.js audit --target ./examples/good-repo --provider anthropic --model claude-haiku-4-5-20251001
node dist/cli.js audit --target ./examples/misnamed-repo --provider anthropic --model claude-haiku-4-5-20251001
node dist/cli.js audit --target ./examples/bare-repo --provider anthropic --model claude-haiku-4-5-20251001
```

Confirm:
- `examples/misnamed-repo`: `CLAUDE.md` is included via guaranteed harness files, remediation appears, tokens stay under 20k
- `examples/bare-repo`: score stays low and remediation `generate` includes all canonical subsystems
- `examples/good-repo`: score remains high and remediation is empty or minor

## Next best step
- Feature: Stage 2 — `npx aiready init`
- Start from: using `.aiready/plan.md` plus `examples/` templates as the generation contract
- Pass when: `npx aiready init --target <bare-repo>` generates missing harness artifacts using actual code as context, with each generated artifact capped at 300 lines

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `scorer.ts` still receives full file content for mapped files only
- `loadRepo()` remains synchronous
- Stage 2 must not be started until Stage 1 is stable

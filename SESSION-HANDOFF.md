# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-013 complete** — Fix init pipeline (3 bugs fixed, new plan.md format)

### feat-013 changes

#### Problem
Three bugs in feat-012's init command:
1. `plan.md` was treated as an improve target (it's AIReady's own instruction file, not a harness artifact)
2. GENERATE items were not being extracted (parser read `## Missing Artifacts` but remediation wrote the old section names)
3. No new artifacts created — consequence of bugs 1+2

#### Solution summary
- `renderRemediationMarkdown` now writes `## GENERATE` / `## IMPROVE` / `## SOURCE CONTEXT` sections (was `## Missing Artifacts` / `## Weak Artifacts`)
- `source_files` field replaces `source_signals` everywhere
- `parsePlan` is now async (`fs/promises`), reads `## GENERATE` and `## IMPROVE` sections
- `isPlanFile()` guard added in both `remediation.ts` (build time) and `parser.ts` (parse time)
- Non-canonical files (e.g., `README.md`, `FEATURE_PLAN.md`) with low scores now trigger GENERATE of the canonical artifact instead of IMPROVE of the non-canonical file
- `CANONICAL_NAMES` set in `remediation.ts` controls this decision
- `{ fast: false }` added to all LLM calls in `generator.ts` and `improver.ts`
- `examples/bare-repo/.aiready/plan.md` updated to new format

#### Modified files
- `src/audit/remediation.ts` — new GENERATE/IMPROVE/SOURCE CONTEXT format, CANONICAL_NAMES, non-canonical→generate logic, isPlanFile() exclusion
- `src/init/parser.ts` — async, reads new section format, source_files field, isPlanFile() exclusion
- `src/init/generator.ts` — source_files (was sourceSignals), { fast: false }
- `src/init/improver.ts` — source_files, { fast: false }
- `src/init/executor.ts` — source_files reference
- `src/init/index.ts` — await parsePlan, source_files in dry-run, "Nothing to do" message
- `tests/init-parser.test.ts` — 9 tests, fixture-based, new format
- `tests/init-executor.test.ts` — 12 tests, new GenerateItem/ImproveItem interfaces
- `tests/remediation.test.ts` — 16 tests, new section names, non-canonical→generate assertions
- `tests/fixtures/init/plan-full.md` — new fixture
- `tests/fixtures/init/plan-nothing-to-generate.md` — new fixture
- `tests/fixtures/init/plan-malformed.md` — new fixture
- `examples/bare-repo/.aiready/plan.md` — updated to new format

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 62.68 KB, zero errors |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `npm test` | pass — 188/188 (14 test files) |
| `node dist/cli.js init --target ./examples/bare-repo --dry-run` | pass — shows 4 items correctly |

## What is broken or unverified
- Live LLM smoke tests not run: no API key in shell.
- `getAuditScore` in `init/scorer.ts` runs the full mapper + scorer pipeline; doubles the token cost of `init`. Future optimisation: cache scored result or use cheaper re-score.

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
- Stage 3 must not be started until Stage 2 is stable (it is now stable)

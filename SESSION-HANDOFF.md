# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-014 complete** — Stage 2 init rebuild: full canonical structure generation

### feat-014 changes

#### New files
- `src/init/planner.ts` — replaces parser.ts; builds complete plan for all 13 canonical artifacts based on subsystem scores and file existence; exports `ArtifactPlan`, `InitPlan`, `buildInitPlan()`
- `src/init/consolidator.ts` — merges entry point files (CLAUDE.md, AGENT.md, .cursorrules, .windsurfrules, .github/copilot-instructions.md) into AGENTS.md, then writes shims; `consolidateEntryPoints()`
- `tests/init-planner.test.ts` — 12 tests: all 13 artifacts, alwaysGenerate, skip/improve/generate logic, subsystem sources
- `tests/init-consolidator.test.ts` — 6 tests: skip-if-no-AGENTS.md, shim writing, unique content merge, already-a-shim detection
- `tests/fixtures/init/plan-with-scores.md` — fixture plan with SUBSYSTEM SCORES + SUBSYSTEM SOURCES sections
- `tests/fixtures/repos/partial-repo/AGENTS.md` — fixture repo with AGENTS.md (identity=90 → skip)
- `tests/fixtures/repos/partial-repo/PROGRESS.md` — fixture repo with PROGRESS.md (state=45 → improve)

#### Modified files
- `src/audit/remediation.ts` — `RemediationPlan` now includes `subsystemScores` and `subsystemSources`; `buildRemediationPlan()` populates them; `renderRemediationMarkdown()` writes `## SUBSYSTEM SCORES` + `## SUBSYSTEM SOURCES` sections before `## GENERATE`
- `src/init/generator.ts` — accepts `ArtifactPlan` instead of `GenerateItem`; strict template adherence system prompt; `detectTechStack()` for Makefile/scripts generation; blank template copy (no LLM) for alwaysGenerate files (TASK.md, features.md, feature_list.json, QUALITY.md)
- `src/init/improver.ts` — accepts `ArtifactPlan` instead of `ImproveItem`; uses `artifact.reason` and `artifact.currentScore` in prompt
- `src/init/executor.ts` — accepts `ArtifactPlan` for both `executeGenerate()` and `executeImprove()`; `InitFlags` adds `yes?: boolean`; alwaysGenerate bypasses existsSync guard
- `src/init/scorer.ts` — new `getAuditScoreDetailed()` returns `{ overall, subsystems }`; `getAuditScore()` delegates to it
- `src/init/index.ts` — full redesign: uses `buildInitPlan()`, shows plan preview with GENERATE/IMPROVE/SKIP groups, confirmation prompt (--yes to bypass), calls `consolidateEntryPoints()`, shows per-subsystem score delta
- `src/cli.ts` — adds `--yes` flag to init command
- `tests/init-executor.test.ts` — updated to use `ArtifactPlan` instead of `GenerateItem`/`ImproveItem`; added alwaysGenerate overwrite test
- `examples/bare-repo/.aiready/plan.md` — updated to new format with SUBSYSTEM SCORES + SUBSYSTEM SOURCES

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 75.31 KB, zero errors |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `npm test` | pass — 207/207 (16 test files) |
| `node dist/cli.js init --target ./examples/bare-repo --dry-run` | pass — shows all 13 canonical artifacts |

## What is broken or unverified
- Live LLM smoke tests not run: no API key in shell.
- `consolidateEntryPoints` uses `{ fast: true }` for extractUniqueContent (fast model); this is intentional (small classification task).
- `getAuditScoreDetailed` runs the full mapper + scorer pipeline; doubles token cost.

## Manual smoke test (requires .env or exported key)
```bash
# Full init run on bare-repo
node dist/cli.js init --target ./examples/bare-repo --yes --provider anthropic --model claude-haiku-4-5-20251001

# Confirm all 13 canonical artifacts present
ls ./examples/bare-repo/
ls ./examples/bare-repo/scripts/

# Re-audit to confirm score improved
node dist/cli.js audit --target ./examples/bare-repo

# Test consolidation on a repo with CLAUDE.md
# (create CLAUDE.md in bare-repo first, then run init)
echo "# CLAUDE.md\nSee project for context." > ./examples/bare-repo/CLAUDE.md
node dist/cli.js init --target ./examples/bare-repo --yes --provider anthropic --model claude-haiku-4-5-20251001
cat ./examples/bare-repo/CLAUDE.md  # should be shim
```

## Next best step
- Feature: Stage 3 — `npx aiready analyze`
- Start from: reads source code + Graphify graph (if present), identifies undocumented intent, writes `.aiready/gaps.md`
- Pass when: `npx aiready analyze --target <repo>` produces a structured gaps file with module-level gap entries

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `loadRepo()` remains synchronous
- `parser.ts` is kept for backward compatibility; `planner.ts` is the new canonical interface

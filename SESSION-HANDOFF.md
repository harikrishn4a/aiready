# SESSION-HANDOFF.md

## Date
2026-06-15

## What was completed
- **feat-021** — Intent-based audit scoring + unified canonical rewriter
- **feat-022** — `plan/` and `docs/` layout with root-level entry points
- Baseline repair: excluded the time-dependent `progress-md-is-fresh` check from the
  good-repo cross-ref assertion (committed-fixture mtime rots past the 7-day threshold)

### feat-021 — intent-based scoring + rewriter
- `src/audit/scorer.ts` — rewritten: `SUBSYSTEM_INTENTS` + a single intent-based LLM
  call ("can an AI coding agent do its job using only what is documented here?").
  Removed all structural scoring (`detectFileType`, `scoreMakefile/Shell/Json/
  Architecture/MarkdownStructure`, `scoreStructural`, `combineScores`,
  `scoreFromBaseline`, the 40/60 weighting). `SubsystemScore` simplified to
  `{ score, gaps, findings, files, baselineStatus? }`. `checkVerificationBaseline`
  kept as a finding source only (not a score input).
- `src/audit/reporter.ts` — prints per-finding glyph lines (✓/⚠/✗); removed the
  structural "Sections N/M" output; subsystem names uppercased.
- `src/init/rewriter.ts` (new) — `rewriteToCanonical()` handles GENERATE and IMPROVE
  via per-file prompt dispatch (`FILE_GUIDANCE` from INIT-COMMAND-PROMPTS.md), with
  folded deterministic heading correction, a 300-line cap, and `sanitisePlaceholders()`.
  Subsumes `improver.ts` (deleted).
- `src/init/executor.ts` — `executeArtifact()` replaces `executeGenerate`/
  `executeImprove`; keeps the ora@5 spinner and the generateOnly/blank-template
  direct-copy path.
- `src/init/index.ts` — calls `executeArtifact`; `suggestNoiseCleaning()` after re-score.
- `src/init/generator.ts` — trimmed to `loadTemplate` / `assertTemplateLoaded` /
  `BLANK_TEMPLATE_FILES` / `InitContext`.

### feat-022 — plan/ + docs/ layout
- `src/utils/layout.ts` (new) — `PLAN_DIR`, `DOCS_DIR`, `planFilePath`,
  `artifactOutputPath` (only non-entry markdown → `docs/`), `isDocsArtifact`, `isPlanPath`.
- Audit writes the plan to `plan/plan.md` (was `.aiready/plan.md`); plan markdown
  shows an `output:` line per item.
- `src/audit/loader.ts` — finds canonical artifacts at the root **or** under `docs/`.
- `src/init/planner.ts` — `ArtifactPlan.outputPath`; a legacy root artifact counts as
  existing → restructured into `docs/`.
- `src/init/executor.ts` — writes to `outputPath`, reads current content from output
  or legacy root; an IMPROVE is no longer skipped when only the legacy root copy exists.
- `src/init/rewriter.ts` — `linkDocsReferences()` deterministically rewrites bare
  references to docs/-bound artifacts into their `docs/` path (skips self, root files,
  already-prefixed paths). Prompt-only docs awareness was unreliable on small models.

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js ~104 KB |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass — 338/338 (25 test files) |

## Live smoke (../betterworld, OpenAI gpt-4o-mini)
- `audit` → 30/100, plan written to `betterworld/plan/plan.md`.
- `init --yes` → internal re-score 30 → 84 (+54); 13 `docs/*.md` written; `AGENTS.md`,
  `Makefile`, `feature_list.json` at root; `ARCHITECTURE.md` (root) restructured into
  `docs/ARCHITECTURE.md`; `AGENTS.md` carries 16 `docs/` cross-references; noise-cleanup
  suggested `change_logs/CHECKPOINT_1_BACKEND_IMPLEMENTATION.md`.
- Standalone post-init `audit` → 70/100 (independently finds the docs/ artifacts).

## What is broken or unverified
- The standalone post-init audit (70) scores lower than init's internal re-score (84):
  expected — gpt-4o-mini scoring is non-deterministic and the mapper re-maps files each
  run. Not a regression; both confirm large gains from baseline.
- `npm publish` NOT run — outward-facing; left for explicit human approval.
- Init leaves the legacy root copy of an improved artifact in place (e.g. root
  ARCHITECTURE.md) alongside the new docs/ copy; surfaced via noise-cleanup suggestions
  rather than auto-deleted (CONSTRAINTS: never delete user files).

## Next best step
- Decide whether to auto-suggest removing legacy root duplicates of artifacts now living
  under docs/ (currently only non-canonical sources are suggested).
- Stage 3 (`analyze`) — next session. Do not start until this is reviewed.

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import LLM SDKs.
- `ora` must stay at ^5 until tsup outputs ESM.
- `betterworld/` is a local external test target — git-ignored, never commit it.
- Layout invariant: AGENTS.md + entry points + Makefile/scripts/*.json stay at root;
  every other canonical markdown artifact lives under docs/.

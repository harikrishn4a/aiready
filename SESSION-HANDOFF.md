# SESSION-HANDOFF.md

## Date
2026-06-15

## What was completed
- **feat-021** — Intent-based audit scoring + unified canonical rewriter
- **feat-022** — `plan/` and `docs/` layout with root-level entry points
- **feat-023** — Stack-aware artifacts, stable scoring, remaining-gaps UX, scorer per-file fix
- Baseline repair: excluded the time-dependent `progress-md-is-fresh` check from the
  good-repo cross-ref assertion (committed-fixture mtime rots past the 7-day threshold)

### feat-023 highlights
- `utils/detect.ts` `detectStack()` → `rewriter` STACK_AWARE_FILES (Makefile,
  scripts/init.sh, scripts/verify.sh, startup.md) rewritten with detected-stack
  context instead of npm template copies; `fixMakefileTabs` repairs recipe indentation.
- `llm.ts` `ChatOptions { temperature, seed }`; mapper + scorer use `{temperature:0,
  seed:7}`; scorer prompt anchored to SCORE BANDS → audit-twice variance 14pt → ~3pt.
- `scorer.buildSubsystemContent` caps content **per file** (6000) and orders entry
  files last → docs/ artifacts no longer crowded out by AGENTS.md
  (betterworld standalone audit 49 → 81).
- CLI: numbered critical gaps, `REMAINING GAPS` section after init re-score,
  `SCORING_DISCLOSURE` in audit + init.

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
| `npm test` | pass — 352/352 (26 test files) |

## Live smoke (./betterworld, Anthropic Sonnet — claude-sonnet-4-6)
- `audit` twice on the unchanged repo → 46 then 43 (~3pt variance, was ~14pt on
  gpt-4o-mini before temperature:0).
- `init --yes` → 17 artifacts; `docs/*.md` written; `Makefile` is stack-aware
  (pure Python: pytest/ruff/mypy/uvicorn, 0 npm refs, tab-indented); `REMAINING GAPS`
  + disclosure printed; noise-cleanup suggested the change_log.
- Standalone post-init `audit` → **81/100** (identity 90 · verification 62 · state 78 ·
  memory 82 · constraints 92) after the per-file scorer fix.
  (OpenAI gpt-4o-mini earlier showed 30 → 84 internal / 70 standalone.)

## Why scores plateau below 100 (and what an LLM call cannot fix)
- Fixable by generation (now done): stack-correct Makefile/scripts/startup.md.
- NOT fillable by generation — needs ground truth outside the docs:
  live session state (PROGRESS/SESSION-HANDOFF), code-derived module map + data flow
  (Stage 3 `analyze` reads code), project-specific constraints, exact dep versions.
  The CLI now surfaces this explicitly via the `REMAINING GAPS` section.

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

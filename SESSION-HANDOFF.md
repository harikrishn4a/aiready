# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-019 complete** — Expanded canonical artifact set (13 → 19), `generateOnly` flag, removed score-gated SKIP

### feat-019 changes

#### Modified files
- `src/audit/remediation.ts` — `generateOnly: boolean` on `CanonicalArtifactDef`; `CANONICAL_ARTIFACTS` expanded to 19; `isEmpty()` exported; `SOURCE_ONLY_FILES` exported; removed `SKIP_THRESHOLD`; new decision logic (no score-gated skip); `makeGenerateItem()` passes generateOnly flag; `renderRemediationMarkdown()` shows `(template copy — no source context needed)` for generateOnly GENERATE items (commits: 9991a14, 81c5358)
- `src/init/planner.ts` — Fully rewritten: imports `CANONICAL_ARTIFACTS`, `isEmpty` from `remediation.ts`; `buildInitPlan()` re-derives all decisions from CANONICAL_ARTIFACTS + filesystem; `ArtifactPlan` gets `generateOnly: boolean`; plan.md used only for `overall`, `subsystemSources`, `sourceContext` (commit: 9991a14)
- `src/init/generator.ts` — Template-copy short-circuit for all `generateOnly` artifacts (commit: 81c5358)
- `tests/remediation.test.ts` — `CANONICAL_ARTIFACTS` coverage block (7 tests); `renderRemediationMarkdown completeness` block (5 tests); replaced score-gated behavior tests (commit: 81c5358)
- `tests/init-planner.test.ts` — Completely rewritten (16 tests for file-existence-based decision logic) (commit: 9991a14)

#### 19 canonical artifacts (generateOnly in parens)
Non-generateOnly (7): AGENTS.md, ARCHITECTURE.md, DECISIONS.md, structure.md, CONSTRAINTS.md, PROGRESS.md, SESSION-HANDOFF.md

generateOnly (12): TASK.md, features.md, feature_list.json, feature-list-schema.json, QUALITY.md, quality-document.md, evaluator_rubric.md, clean-state-checklist.md, startup.md, Makefile, scripts/init.sh, scripts/verify.sh

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 103.43 KB |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass — 310/310 (21 test files) |

## What is broken or unverified
- Live LLM audit on real repos not run (no API key in shell)
- `buildInitPlan()` test: partial-repo fixture only has AGENTS.md + PROGRESS.md — live repo with all 19 existing not smoke-tested

## Next best step
- Live `init` smoke on a real repo: `node dist/cli.js init --target <repo> --dry-run` — verify 19 artifacts appear with correct GENERATE/IMPROVE/SKIP actions
- Consider feat-020: init executor — handle `alwaysGenerate=true` overwrite + `generateOnly=true` template-copy write path

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import LLM SDKs
- `isEmpty()` in remediation.ts — threshold (50 chars) or stripping logic changes break planner decisions
- `CANONICAL_ARTIFACTS` order — tests rely on the 19-item list being stable

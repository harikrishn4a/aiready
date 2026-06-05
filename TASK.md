# TASK.md — feat-014: Stage 2 init — full canonical structure generation

## Feature ID
feat-014

## Scope — what will change
- NEW `src/init/planner.ts` — replaces parser.ts; builds plan for ALL 13 canonical artifacts
- UPDATED `src/init/generator.ts` — strict template prompt, tech stack detection, blank template copy
- UPDATED `src/init/improver.ts` — accepts ArtifactPlan instead of ImproveItem
- UPDATED `src/init/executor.ts` — accepts ArtifactPlan for both generate and improve
- UPDATED `src/init/scorer.ts` — new getAuditScoreDetailed() returning per-subsystem scores
- UPDATED `src/init/index.ts` — planner, plan preview, confirmation prompt, per-subsystem delta
- NEW `src/init/consolidator.ts` — merge CLAUDE.md/.cursorrules etc. into AGENTS.md, write shims
- UPDATED `src/audit/remediation.ts` — write SUBSYSTEM SCORES + SUBSYSTEM SOURCES to plan.md
- UPDATED `src/cli.ts` — add --yes flag to init command

## Canonical artifact set (13 files)
AGENTS.md, CONSTRAINTS.md, ARCHITECTURE.md, DECISIONS.md, PROGRESS.md, SESSION-HANDOFF.md,
TASK.md, features.md, feature_list.json, QUALITY.md, Makefile, scripts/init.sh, scripts/verify.sh

## Decision logic per artifact
- Skip threshold: score >= 80 AND file exists → skip
- Improve: score < 80 AND file exists → improve
- Generate: file does not exist → generate
- alwaysGenerate=true: never skip, always generate (blank template copy, no LLM)

## Modules (in order)
1. Create fixture files and fixture repos
2. Update remediation.ts — add SUBSYSTEM SCORES + SUBSYSTEM SOURCES sections
3. Create planner.ts + tests
4. Update generator.ts — strict prompt, tech stack detection, blank template copy
5. Update improver.ts + executor.ts — ArtifactPlan type throughout
6. Create consolidator.ts + tests
7. Update scorer.ts — getAuditScoreDetailed()
8. Update index.ts — full pipeline: planner, preview, confirm, execute, consolidate, score delta
9. Update cli.ts — --yes flag

## Completion gate
- npm run build — zero errors
- npm run typecheck — zero errors
- npm run lint — clean
- npm test — all pass including new planner + consolidator tests
- node dist/cli.js init --target ./examples/bare-repo --dry-run — shows 13 artifacts

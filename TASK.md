# TASK.md — feat-015: Template-based scoring and complete plan.md

## Feature ID
feat-015

## Scope — what will change
- NEW `src/audit/templates.ts` — template-subsystem mapping, loadTemplates(), extractSectionHeadings()
- UPDATED `src/audit/scorer.ts` — structural score (deterministic section coverage) + template-aware content scoring; new SubsystemScore fields; scoreStructural() exported
- UPDATED `src/audit/remediation.ts` — async buildRemediationPlan(); canonical-file-based SKIP/IMPROVE/GENERATE decisions; all 13 artifacts in plan.md; ## SKIP section
- UPDATED `src/audit/reporter.ts` — terminal output shows template section coverage per subsystem
- UPDATED `src/audit/index.ts` — await buildRemediationPlan()

## Problems being fixed
1. Scoring is template-blind: LLM scores files without knowing the ideal structure
2. One-dimensional scoring: missing structural completeness dimension
3. Wrong SKIP/IMPROVE/GENERATE decisions: based on subsystem score, not canonical file existence

## Design decisions
- Final score = structural × 0.4 + content × 0.6
- Structural score: deterministic, counts ## heading matches vs template
- Content score: single LLM call, system prompt includes template section list per subsystem
- is_harness_artifact: false → content score capped at 20
- SKIP threshold: 80 (structural + content)
- buildRemediationPlan is now async (needs to read canonical files from disk)
- All 13 canonical artifacts always appear in plan.md (generate/improve/skip)
- plan.md/.aiready/* files never as GENERATE/IMPROVE targets

## Modules (in order)
1. src/audit/templates.ts + tests
2. src/audit/scorer.ts redesign + tests update
3. src/audit/remediation.ts async + canonical decisions + tests update
4. src/audit/reporter.ts template coverage + tests update
5. src/audit/index.ts await fix

## Completion gate
- npm run build — zero errors
- npm run typecheck — zero errors
- npm run lint — clean
- npm test — all pass including new templates tests

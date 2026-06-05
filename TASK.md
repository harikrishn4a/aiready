# TASK.md — feat-011: Graphify semantic query, strict scoring, agent remediation plan

## Feature
feat-011 — Improve Stage 1 audit as a durable audit-to-init contract while keeping Stage 2 unimplemented.

## Scope
New files:
- src/audit/remediation.ts — generate/improve/review_manually contract, markdown renderer, plan writer
- src/utils/spinner.ts     — TTY-only sea-green loading spinner
- tests/remediation.test.ts
- tests/spinner.test.ts

Modified files:
- src/audit/loader.ts      — guaranteed harness files, semantic Graphify node-label matching, 6000-char content cap
- src/audit/mapper.ts      — restore 5-line triage previews, keep 50-line classification previews
- src/audit/scorer.ts      — strict course-aligned scoring criteria and findings shape
- src/audit/reporter.ts    — short CLI summary + JSON remediation
- src/audit/index.ts       — build/write `.aiready/plan.md`, pass remediation to reporter, wrap LLM phases in spinner
- tests/*                  — update helpers and add coverage for new contracts

## Out of scope
- No Stage 2 work
- No automatic cleanup/deletion of messy harness files
- No overwriting canonical harness artifacts

## Pass criteria
- npm run build: zero errors
- npm run typecheck: zero errors
- npm run lint: clean
- npm test: all tests pass (151+ tests)
- `.aiready/plan.md` is written during audit and references examples templates
- `--json` includes `remediation` and `token_usage`
- Generated/improved artifact items include `max_lines: 300`

## Implementation order
1. Loader semantic selection
2. Strict scorer prompt/findings
3. Remediation contract and plan renderer
4. Reporter/index plan + JSON wiring
5. Spinner utility
6. Tests
7. Full verification and docs

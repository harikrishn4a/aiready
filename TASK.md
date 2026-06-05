# TASK.md — Sprint Contract

## Feature: feat-017 — Init plan contract + graphify context + full writes

## Goal
Init must execute `.aiready/plan.md` exactly (no planner re-decisions), write full LLM output (strip fences), treat empty improve targets as generate, and use Graphify context with thin-source expansion.

## Scope
- `src/init/output.ts` — `cleanLLMOutput()`
- `src/init/parser.ts` — parse GENERATE/IMPROVE/SKIP/SOURCE CONTEXT
- `src/init/planner.ts` — pure parser adapter (no CANONICAL_ARTIFACTS decisions)
- `src/init/context.ts` — graphify always-on context, thin-source expansion
- `src/utils/graphify.ts` — shared graphify ranking (audit + init)
- `src/init/generator.ts`, `improver.ts`, `executor.ts`, `index.ts`
- Tests with betterworld graphify-mini fixture

## Out of scope
- Re-running audit on betterworld (user can do with API key)
- Writing to betterworld without user confirmation

## Verification
```bash
npm run build && npm run typecheck && npm run lint && npm test
node dist/cli.js init --target <betterworld> --dry-run  # 8 IMPROVE, 5 SKIP, 0 GENERATE
```

## Evidence gate
- [x] cleanLLMOutput strips fences; written files >10 lines in tests
- [x] planner parses plan only — betterworld dry-run matches plan
- [x] empty improve → generate path
- [x] graphify context tests with betterworld-mini fixture
- [x] 237/237 tests pass

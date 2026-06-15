# TASK.md — Session 12: Init redesign (canonical rewrite)

## Feature
feat-021 — Unified canonical rewriter + executor with per-file prompts

## Scope
- New `src/init/rewriter.ts`: `rewriteToCanonical()` (handles GENERATE + IMPROVE),
  `sanitisePlaceholders()`, per-file prompt dispatch keyed by canonical filename
  (rules from INIT-COMMAND-PROMPTS.md), folded-in deterministic heading correction
  and 300-line cap.
- `src/init/executor.ts`: replace `executeGenerate`/`executeImprove` with a single
  `executeArtifact()` that resolves sources, reads current content, rewrites via
  `rewriteToCanonical`, sanitises, writes. Keeps ora spinner, skip/force semantics,
  generateOnly/blank-template copy path.
- `src/init/index.ts`: call `executeArtifact`; add `suggestNoiseCleaning()` at the
  end of `runInit()` after re-scoring.
- Consolidator already only shims AGENT_ENTRY_FILES — verify, no change expected.

## Exclusions
- Stage 3 (analyze) — not started this session.
- No change to audit scorer beyond Module 1 (already committed).
- generateOnly artifacts remain pure template copies (no LLM customization).

## Files expected to change
- src/init/rewriter.ts (new)
- src/init/executor.ts
- src/init/index.ts
- src/init/generator.ts (trim: keep loadTemplate/assertTemplateLoaded/BLANK_TEMPLATE_FILES/InitContext)
- src/init/improver.ts (remove — subsumed by rewriter)
- tests/init-rewriter.test.ts (new)
- tests/init-executor.test.ts, tests/init-executor-spinner.test.ts, tests/init-generator.test.ts (retarget to new API)

## Verification standard
```
npm run build && npm run typecheck && npm run lint && npm test
```

## Acceptance criteria
- rewriteToCanonical uses exact template headings, includes existing content,
  enforces 300-line cap, dispatches per-file prompts.
- sanitisePlaceholders removes {{PLACEHOLDER}} text.
- executeArtifact unifies generate/improve; suite green.
- Noise cleanup suggestion prints at end of init.

## Invariants
- `src/utils/llm.ts` is the only file importing LLM SDKs.
- `ora` stays at ^5 (CJS bundle).
- generateOnly artifacts skip the LLM (template copy).

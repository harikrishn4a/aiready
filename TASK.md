# TASK.md — feat-020: Heading enforcement, correction pass, spinner

## Feature ID
feat-020

## Sprint goal
Fix heading drift in generated harness artifacts by (1) enforcing exact headings in system prompt, (2) adding a post-generation correction pass, and (3) showing a spinner/progress indicator during LLM calls.

## Modules

### Module 1 — src/init/generator.ts (strict heading enforcement)
- Replace SYSTEM_PROMPT with strict GENERATION_SYSTEM that has explicit HEADING RULES
- Tests in tests/init-generator.test.ts: generated content uses new system prompt

### Module 2 — src/init/corrector.ts (new file)
- `findDriftedHeadings(content, template)` — fuzzy similarity, no LLM
- `replaceHeadings(content, drifted, canonical)` — string replace, no LLM
- `correctHeadings(content, template, filename, provider)` — deterministic + optional LLM for still-missing sections
- Apply in executor.ts after every generate/improve call before write
- Tests in tests/init-corrector.test.ts

### Module 3 — ora spinner in executor.ts
- Add `ora` dependency (record in DECISIONS.md)
- executor.ts executeGenerate/executeImprove show spinner during LLM call
- Spinner text updates to "Correcting headings..." before stopping
- Tests in tests/init-executor.test.ts

## Completion gate
- npm run build: zero errors
- npm run typecheck: zero errors
- npm run lint: clean
- npm test: all pass

## Out of scope
- Stage 3 (analyze) — do not touch
- Any audit pipeline changes

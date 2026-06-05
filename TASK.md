# TASK.md — feat-013: Fix init pipeline (parser, reporter format, generator, improver)

## Feature ID
feat-013

## Bugs being fixed
1. plan.md treated as an IMPROVE target — must never appear in generate/improve lists
2. parser.ts reads old `## Missing Artifacts` format — plan.md now writes `## GENERATE`/`## IMPROVE`
3. No new artifacts created — consequence of bugs 1+2

## Design decisions
- Non-canonical mapped file + score < 60 → GENERATE canonical artifact (not IMPROVE non-canonical)
- plan.md / .aiready/plan.md always excluded from generate/improve at both build and parse time
- `source_files` replaces `source_signals` — actual file paths only, no description strings
- `parsePlan` is async (uses fs/promises)
- LLM calls use `{ fast: false }` for quality output

## Modules (in order)
1. Create fixture files
2. Rewrite `src/init/parser.ts` — new format, async
3. Update `src/audit/remediation.ts` — new format output, non-canonical logic
4. Update `src/init/generator.ts` — sourceFiles, fast: false
5. Update `src/init/improver.ts` — sourceFiles, fast: false
6. Update `src/init/executor.ts` + `src/init/index.ts` — new types, await parsePlan

## Completion gate
- npm run build — zero errors
- npm run typecheck — zero errors
- npm run lint — clean
- npm test — all pass including new init/parser tests
- node dist/cli.js init --target ./examples/bare-repo --dry-run — shows items

# TASK.md — audit plan source cleanup

## Feature ID
feat-016

## Scope — what will change
- UPDATED `src/audit/remediation.ts` — dedupe SOURCE CONTEXT by path, prefer non-empty source files for IMPROVE items, and keep state artifact fixes file-specific
- UPDATED `tests/remediation.test.ts` — regression coverage for source-context dedupe, useful source selection, and distinct PROGRESS.md / SESSION-HANDOFF.md fix text

## Problems being fixed
1. `plan.md` can appear multiple times in SOURCE CONTEXT when it maps to multiple subsystems
2. IMPROVE `source_files` can point only to empty canonical artifacts instead of non-empty source context
3. PROGRESS.md and SESSION-HANDOFF.md can receive misleading shared state-subsystem missing/fix text

## Design decisions
- SOURCE CONTEXT is grouped by file path and lists all mapped subsystems
- Empty or missing files are not useful source context
- Non-empty non-canonical files are preferred for canonical IMPROVE items
- Init executor changes are explicitly out of scope for this session

## Modules (in order)
1. src/audit/remediation.ts source selection helpers
2. src/audit/remediation.ts SOURCE CONTEXT grouping/rendering
3. tests/remediation.test.ts regression coverage
4. project state docs

## Completion gate
- npm run build — zero errors
- npm run typecheck — zero errors
- npm run lint — clean
- npm test — all pass

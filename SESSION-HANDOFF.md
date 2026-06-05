# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-009 complete** — Two-stage mapper triage + session token logging

### feat-009 changes
#### New files
- `src/utils/tokens.ts` — `estimateTokens()` (1 token ≈ 4 chars, no external tokenizer)
- `tests/tokens.test.ts` — 3 tests

#### Modified files
- `src/audit/mapper.ts` — split into `triageFiles()` (5-line previews) + `classifyFiles()` (50-line previews); empty triage skips classification
- `src/utils/llm.ts` — `getTotalTokens()` on `LLMProvider` interface and all three providers; cumulative input+output estimates per `chat()` call
- `src/audit/index.ts` — logs `Tokens used: ~Nk` after terminal report; passes `tokenUsage` to reporter for JSON
- `src/audit/reporter.ts` — JSON output includes `token_usage` when provided
- `tests/mapper.test.ts` — rewritten for two-stage flow (8 tests)
- `tests/llm.test.ts` — token accumulation test
- `tests/reporter.test.ts` — `token_usage` in JSON test
- `tests/integration.test.ts` — `makeMapperProvider()` for two-stage mocks; `getTotalTokens` on mocks
- `tests/scorer.test.ts` — mock providers include `getTotalTokens`

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 29.98 KB, zero errors |
| `npm test` | pass — 131/131 (10 test files) |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |

## What is broken or unverified
- Manual smoke tests on `examples/good-repo` and `examples/misnamed-repo` with live LLM not run this session (require API key)
- Token counts are estimates (chars/4), not provider-reported usage

## Manual smoke test (requires .env or exported key)
```bash
node dist/cli.js audit --target ./examples/good-repo --provider anthropic --model claude-haiku-4-5-20251001
node dist/cli.js audit --target ./examples/misnamed-repo --provider anthropic --model claude-haiku-4-5-20251001
node dist/cli.js audit --target ./examples/good-repo --provider anthropic --json
```

Confirm: no 429 errors, token count at end, misnamed-repo maps CLAUDE.md / TODO.md / docs/overview.md.

## Next best step
- Feature: Stage 2 — `npx aiready init`
- Start from: TASK.md sprint contract for init command
- Pass when: `npx aiready init --target <bare-repo>` generates missing harness artifacts

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `scorer.ts` still receives full file content for mapped files only
- Stage 2 must not be started in the same session as Stage 1 fixes

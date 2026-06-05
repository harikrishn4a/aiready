# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-020 complete** — Heading enforcement, post-generation correction pass, ora@5 spinner

### feat-020 changes

#### Modified files
- `src/init/generator.ts` — `SYSTEM_PROMPT` → `GENERATION_SYSTEM` with explicit character-for-character heading rules (commit: 1488917); `loadTemplate()` exported for executor use (commit: 65780a4)
- `src/init/corrector.ts` (new) — `findDriftedHeadings()` (Dice bigram similarity > 0.6), `replaceHeadings()` (regex replace, escapes special chars), `correctHeadings()` (deterministic + optional LLM for missing sections) (commit: 65780a4)
- `src/init/executor.ts` — Corrector wired after every generate/improve; `cleanLLMOutput` applied to corrected output; ora@5 spinner shows "Generating..." / "Correcting headings..."; spinner skipped for `generateOnly` artifacts (commits: 65780a4, 645ca0b)
- `tests/init-generator.test.ts` — 2 new tests: system prompt enforces exact headings, fast:false (commit: 1488917)
- `tests/init-corrector.test.ts` (new) — 12 tests: replaceHeadings (4), findDriftedHeadings (4), correctHeadings (4) (commit: 65780a4)
- `tests/init-executor-spinner.test.ts` (new) — 7 spinner tests with vi.mock('ora') (commit: 645ca0b)
- `DECISIONS.md` — ora@5 rationale entry (commit: 645ca0b)

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 109.54 KB |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass — 331/331 (23 test files) |

## What is broken or unverified
- Live `init` smoke on a real repo not run (no API key in shell)
- The corrector's LLM pass for missing sections is tested with mocks; real-world heading addition not smoke-tested
- `ora@5` is pinned — upgrading to v6+ will break the CJS bundle (tsup outputs CJS; ora@6+ is ESM-only)

## Key design notes
- **Dice bigram similarity threshold 0.6**: "Tech Stack" → "Stack" (0.615), "Current Build Status" → "Current State" (0.625). "Project Overview" → "What this is" is ~0.08 (not matched). Threshold chosen to catch paraphrase without false positives.
- **corrector.ts never modifies content under headings** — only heading lines themselves are replaced by regex
- **generateOnly artifacts skip corrector**: template copies need no correction (they ARE the canonical form)
- **cleanLLMOutput applied twice**: once after LLM generate/improve, once after corrector's LLM pass — ensures fences are stripped even if corrector LLM adds them

## Next best step
- Live `init` smoke: `node dist/cli.js init --target <repo> --yes` — verify spinner visible, corrections logged for drifted headings
- Consider feat-021: init executor — handle `alwaysGenerate=true` overwrite + verify ARCHITECTURE.md stays current

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import LLM SDKs
- `ora` version must stay at ^5 until tsup is migrated to ESM output
- Dice bigram threshold in corrector.ts — changing breaks the boundary between "paraphrase" and "different section"

# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-010 complete** — Graphify integration, filename-only triage, mapped-file cross-reference fix

### feat-010 changes

#### Modified files
- `src/audit/loader.ts` — added Graphify detection (`findGraphifyOutput`: checks direct paths + dated subdirs `graphify-out/YYYY-MM-DD/graph.json`); `loadFromGraph()` computes degree centrality from links, picks top-10 document `.md` nodes; `RepoFiles` gains `usedGraphify: boolean`; logs which path was used
- `src/audit/mapper.ts` — `triageFiles()` → `triageByFilename()`: sends filename list only, no content previews (~10× cheaper); `mapFiles()` gains optional `usedGraphify = false` param — when true, skips triage and goes straight to `classifyFiles()`; updated TRIAGE_SYSTEM prompt to match filename-only input
- `src/audit/cross-ref.ts` — `crossRef()` now accepts optional `mappings: FileMapping[] = []`; `checkCommands` falls back to content of identity/verification-mapped files when `agentsMd` is null; `checkModules` falls back to memory-mapped files when `architectureMd` is null; eliminates false "No AGENTS.md" errors on non-standard repos
- `src/audit/scorer.ts` — passes `mappings` to `crossRef(files, mappings)`
- `src/audit/index.ts` — passes `files.usedGraphify` to `mapFiles()`

#### Updated tests
- `tests/loader.test.ts` — 6 new Graphify tests: `usedGraphify` flag, centrality ranking, non-document node filtering, dated subdirectory, malformed JSON graceful handling
- `tests/mapper.test.ts` — updated triage prompt test (filenames-only, not 5-line previews); new `usedGraphify=true` skips-triage test (9 tests total)
- `tests/cross-ref.test.ts` — added `mdFiles: []` / `usedGraphify: false` to `makeFiles()` helper; 4 new mapped-file fallback tests (18 tests total)

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 33.13 KB, zero errors |
| `npm test` | pass — 142/142 (10 test files) |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |

## What is broken or unverified
- Graphify integration untested against a real `graphify-out/graph.json` from an actual Graphify run
- Cross-ref mapped-file fallback untested end-to-end with a live LLM audit

## Manual smoke test (requires .env or exported key)
```bash
# Test Graphify path (if graphify-out/ exists in target)
node dist/cli.js audit --target /path/to/graphified-repo --provider anthropic --model claude-haiku-4-5-20251001
# Expected: "Using Graphify knowledge graph (graphify-out/...)" + "Top N files by centrality selected"

# Test fallback path (examples/good-repo has no graphify-out/)
node dist/cli.js audit --target ./examples/good-repo --provider anthropic --model claude-haiku-4-5-20251001
# Expected: filename triage, token count at end, no "No AGENTS.md" cross-ref failure

# Test misnamed-repo (CLAUDE.md mapped to identity/verification — should not show false cross-ref failure)
node dist/cli.js audit --target ./examples/misnamed-repo --provider anthropic --model claude-haiku-4-5-20251001
# Expected: no "No agent harness file found to extract commands from" when CLAUDE.md is mapped
```

## Next best step
- Feature: Stage 2 — `npx aiready init`
- Start from: TASK.md sprint contract for init command
- Pass when: `npx aiready init --target <bare-repo>` generates missing harness artifacts using actual code as context

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `scorer.ts` still receives full file content for mapped files only
- `loadRepo()` remains synchronous — no async plumbing in the loader
- Stage 2 must not be started until Stage 1 is stable

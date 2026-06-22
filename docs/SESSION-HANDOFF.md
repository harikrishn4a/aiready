# SESSION-HANDOFF.md

## Date
2026-06-22

## What was completed
- **feat-024** — Stage 3 `npx aiready analyze` (complete)

### feat-024 highlights

**New modules:**
- `src/analyze/loader.ts` — `walkSourceFiles` (extension + skip-list, depth ≤ 6,
  no `src/` assumption), `rankSourceFilesWithGraph` (graph centrality for source
  files, separate from audit's `.md`-only `rankGraphifyFiles`), `loadSourceFiles`
  returning `{ all, relevant, usedGraphify, detectedExtensions }`.
- `src/analyze/analyzer.ts` — `runStructuralPass` (Level 1: string-match every
  module name vs harness text, no LLM), `runSemanticPass` (Level 2: one LLM call
  per relevant file, returns gap type + summary + proposed doc block), `analyzeGaps`
  (merge: semantic wins over structural for same module).
- `src/analyze/reporter.ts` — `reportAnalysis`: two-section CLI output (STRUCTURAL
  GAPS ✗ / SEMANTIC GAPS ⚠), severity labels, token count, output path.
- `src/analyze/writer.ts` — `renderGapsMd` + `writeGaps`: `.aiready/gaps.md` grouped
  high→medium→low with language-correct code fences per proposed doc.
- `src/analyze/index.ts` — `runAnalyze` entry point (replaced `export {}` stub).

**New utilities:**
- `src/utils/detect.ts` — `detectSourceExtensions(targetDir): Set<string>` and
  `SOURCE_EXTENSIONS` constant (does not change `detectStack()` signature).
- `src/utils/layout.ts` — `gapsFilePath(target): string`.

**CLI:** `analyze` command registered in `src/cli.ts` with `--target/--provider/--model`.

**Prompt quality fix:** LLM system prompt explicitly forbids wrong formats per extension
(e.g. "Do NOT use `/** */` in Python files"). User message header includes
`REQUIRED DOC FORMAT: Python triple-quote docstring """ ... """` adjacent to the code.

**vite override:** Added `"vite": "^6.0.0"` to `package.json` overrides — vite 7
dropped Node 18 support, breaking `vitest run` with `ERR_REQUIRE_ESM`.

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js ~152 KB |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm test` | pass — 449/449 (32 test files, 81 new) |
| `analyze --target ./betterworld` | pass — 163 gaps, gaps.md written, ~540k tokens |

## What is broken or unverified
- `npm install` on Node 18 requires `npm_config_engine_strict=false` due to `engines: >=20`
- Proposed doc blocks occasionally have imperfect content (LLM quality), but format is now enforced correctly (Python → docstring, TS/JS → JSDoc) — verified on betterworld
- betterworld has 163 relevant source files so ALL are LLM-analyzed (~540k tokens with Haiku). Repos with many files may be expensive; no cap currently enforced on Level 2

## Next best step
- Stage 4 (`analyze drift`) — compare harness docs against git history to find stale docs
- Consider adding `--max-files N` flag to analyze to cap Level 2 LLM calls on large repos
- Update `docs/structure.md` to document `.aiready/gaps.md` as a Stage 3 output artifact

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import LLM SDKs
- `rankGraphifyFiles` in `utils/graphify.ts` must NOT be modified (audit uses it, .md-only)
- `detectStack()` signature must remain `(targetDir: string): string` (init/rewriter.ts)
- `ora` must stay at ^5 until tsup outputs ESM
- `betterworld/` is a local external test target — git-ignored, never commit it
- Layout invariant: AGENTS.md + entry points + Makefile/scripts/*.json stay at root;
  every other canonical markdown artifact lives under docs/

# TASK.md — Session 13: Stage 3 analyze command

## Feature
feat-024 — `npx aiready analyze`: two-level semantic gap detection

## Scope
- `src/utils/detect.ts`: add `detectSourceExtensions(targetDir): Set<string>` and
  `SOURCE_EXTENSIONS` constant. Does NOT change `detectStack()` signature.
- `src/utils/layout.ts`: add `gapsFilePath(target): string`.
- `src/analyze/loader.ts` (new): `walkSourceFiles` (extension + skip-list, depth ≤ 6),
  `rankSourceFilesWithGraph` (centrality scoring, separate from audit's `.md`-only
  `rankGraphifyFiles`), `loadSourceFiles` → `SourceFiles { all, relevant, usedGraphify,
  detectedExtensions }`.
- `src/analyze/analyzer.ts` (new): `runStructuralPass` (no LLM, string match),
  `runSemanticPass` (one LLM call per file, returns gap + proposed doc block),
  `analyzeGaps` (merge Level 1 + Level 2). Proposed docs enforce language-correct
  format: Python triple-quote, JS/TS JSDoc. File ext passed in user message header.
- `src/analyze/reporter.ts` (new): `reportAnalysis` — STRUCTURAL GAPS / SEMANTIC GAPS
  two-section terminal output with ✗/⚠ glyphs.
- `src/analyze/writer.ts` (new): `renderGapsMd` + `writeGaps` → `.aiready/gaps.md`,
  severity-grouped, language-appropriate code fences per proposed doc.
- `src/analyze/index.ts`: replace `export {}` stub with `runAnalyze`.
- `src/cli.ts`: register `analyze` command with `--target/--provider/--model`.
- `package.json`: add `"vite": "^6.0.0"` to overrides (Node 18 / vite 7 incompatibility).
- Tests: `analyze-loader`, `analyze-analyzer`, `analyze-reporter`, `analyze-writer`,
  cli.test.ts additions. 81 new tests.

## Exclusions
- Stage 4 (drift) — not started.
- No changes to audit or init pipelines.

## Files changed
- src/utils/detect.ts, src/utils/layout.ts
- src/analyze/index.ts, loader.ts, analyzer.ts, reporter.ts, writer.ts (new)
- src/cli.ts
- package.json
- tests/analyze-loader.test.ts, analyze-analyzer.test.ts, analyze-reporter.test.ts,
  analyze-writer.test.ts (new); tests/cli.test.ts (additions)

## Verification standard
```
npm run build && npm run typecheck && npm run lint && npm test
node dist/cli.js analyze --target ./betterworld --provider anthropic
```

## Acceptance criteria
- `npx aiready analyze` registered in CLI, runs without error
- Level 1 structural pass covers all walked files with no LLM calls
- Level 2 semantic pass generates language-correct proposed doc blocks
- `.aiready/gaps.md` written with severity-grouped findings + proposed docs
- Python files get triple-quote docstrings; TS/JS files get JSDoc
- CLI terminal output shows two-section STRUCTURAL / SEMANTIC summary
- All verification commands pass (449 tests)
- Smoke test on betterworld: gaps.md written, token count printed

## Invariants
- `src/utils/llm.ts` is the only file importing LLM SDKs
- `rankGraphifyFiles` in utils/graphify.ts is NOT modified (audit uses it, .md-only)
- `detectStack()` signature unchanged (init/rewriter.ts uses it)
- `ora` stays at ^5 (CJS bundle)

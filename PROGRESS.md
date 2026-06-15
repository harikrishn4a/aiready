# PROGRESS.md — AIReady

## Current state
- Build: passing — dist/cli.js 104 KB (full pipeline + Stage 2 bundled)
- Tests: 338/338 passing (25 test files)
- Typecheck: clean
- Lint: clean
- Last verified: 2026-06-15
- Active feature: none — **feat-021, feat-022 complete**
- Live smoke: audit + init verified on ../betterworld via OpenAI gpt-4o-mini
  (30 → 84 internal re-score; standalone post-init audit 70/100)

## Completed
- [x] Product design and stage definitions
- [x] AGENTS.md, ARCHITECTURE.md, DECISIONS.md
- [x] Example harness templates in examples/
- [x] **feat-000** — Project scaffold (build/test/typecheck/lint all passing)
- [x] **feat-001** — Audit loader: loadRepo() reads target repo into typed RepoFiles struct; now also walks all .md files into mdFiles[]
- [x] **feat-002** — Audit scorer: scoreRepo() scores 5 subsystems, content-aware heuristics (replaced by LLM scorer in feat-006)
- [x] **feat-003** — Cross-ref: validates commands in AGENTS.md vs package.json, modules vs src/
- [x] **feat-004** — Reporter: terminal bar-chart output + JSON mode; audit pipeline wired end-to-end
- [x] **feat-005** — Integration: good-repo scores 100/100, bare-repo scores 0/100, all CLI flags verified
- [x] **feat-006** — LLM-powered audit rebuild: mapper.ts (Haiku classifies md files → subsystems), scorer.ts (Sonnet scores quality per subsystem), reporter.ts (file attribution), ANTHROPIC_API_KEY guard
- [x] **feat-007** — Provider abstraction: LLMProvider interface, AnthropicProvider + OpenAIProvider + OllamaProvider, interactive --provider/--model selection, dotenv, .env.example
- [x] **feat-008** — Dynamic model lists: OpenAI models fetched live from /v1/models (fallback on failure), Anthropic versioned list in models.ts, modelId replaces modelTier throughout AuditConfig
- [x] **feat-009** — Two-stage mapper triage (5-line previews → classify 50-line previews) + session token counter logged at end of audit
- [x] **feat-010** — Graphify integration (centrality ranking), filename-only triage fallback, fix cross-reference to use mapped file paths
- [x] **feat-011** — Graphify semantic query, strict scoring criteria, `.aiready/plan.md` remediation contract, and sea-green TTY spinner

## In progress
- nothing — feat-022 complete

## Blocked
- nothing

## Session 12 (2026-06-15)
- [x] **feat-021** — Intent-based scoring + canonical rewrite. Audit scorer is now
  100% intent-based (one LLM call, "can an agent do its job with only what's
  documented here?"); removed all structural scoring (detectFileType,
  scoreMakefile/Shell/Json/Architecture/MarkdownStructure, scoreStructural,
  combineScores, scoreFromBaseline, 40/60 weighting). SubsystemScore simplified to
  { score, gaps, findings, files, baselineStatus? }. New src/init/rewriter.ts
  (rewriteToCanonical + sanitisePlaceholders + per-file prompt dispatch from
  INIT-COMMAND-PROMPTS.md + folded heading correction + 300-line cap) replaces
  improver. Unified src/init/executor.ts executeArtifact() (was
  executeGenerate/executeImprove). suggestNoiseCleaning() at end of init.
- [x] **feat-022** — Layout: audit writes plan to plan/plan.md (was .aiready/);
  init writes non-entry markdown artifacts under docs/; entry points (AGENTS.md,
  CLAUDE.md, .cursorrules, .windsurfrules, copilot) + build files (Makefile,
  scripts/, *.json) stay at root. New src/utils/layout.ts. Loader finds artifacts
  at root or docs/. Planner adds outputPath, treats legacy root artifacts as
  existing → restructure into docs/. rewriter.linkDocsReferences() deterministically
  rewrites cross-references to docs/ paths.

## Backlog — Stage 1

### Scaffolding — DONE
- [x] package.json, tsconfig.json, eslint.config.js, vitest.config.ts, tsup.config.ts
- [x] src/cli.ts — Commander with audit command, --target/--json/--min-score options
- [x] Stub directories: src/audit/, src/init/, src/analyze/, src/drift/, src/fix/
- [x] feature_list.json, features.md

### Stage 1 core — DONE
- [x] src/audit/loader.ts — reads target repo files into memory
- [x] src/audit/scorer.ts — scores 5 subsystems
- [x] src/audit/cross-ref.ts — validates docs vs project files
- [x] src/audit/reporter.ts — terminal and JSON output
- [x] src/utils/fs.ts — filesystem helpers
- [x] src/utils/detect.ts — package manager detection (stub, used in Stage 2+)
- [x] 89 tests across 6 test files

### Stage 1 verification — DONE
- [x] `npx aiready audit --target test-fixtures/good-repo` scores 100/100 (> 70) ✓
- [x] `npx aiready audit --target test-fixtures/bare-repo` scores 0/100 (< 30) ✓
- [x] `npx aiready audit --json` outputs valid JSON with expected schema ✓
- [x] `npx aiready audit --min-score 80` exits with code 1 when score is below threshold ✓

### Stage 1 LLM rebuild verification — DONE
- [x] `node dist/cli.js audit` exits 1 with ERROR/WHY/FIX when ANTHROPIC_API_KEY not set ✓
- [x] mapper.ts uses claude-haiku-4-5-20251001 for classification ✓
- [x] scorer.ts uses claude-sonnet-4-6 for quality scoring ✓
- [x] reporter.ts shows file attribution per subsystem ✓
- [x] examples/good-repo, bare-repo, misnamed-repo fixtures created ✓
- [x] DECISIONS.md updated with two 2026-06-05 entries ✓

## Completed — Stage 2
- [x] **feat-012** — `npx aiready init`: parser (plan.md → InitPlan), generator (template + source context → artifact), improver (section-level LLM patch), executor (skip/force/write lifecycle), scorer (pipeline reuse for before/after delta), index (dry-run, sequential execute, re-score)
- [x] **feat-013** — Fix init pipeline: new `## GENERATE`/`## IMPROVE`/`## SOURCE CONTEXT` plan.md format; async parser; `source_files` field replaces `source_signals`; non-canonical files → GENERATE canonical artifact; `plan.md` excluded from generate/improve targets; `{ fast: false }` for quality LLM output
- [x] **feat-014** — Stage 2 init rebuild: planner.ts generates plans for all 13 canonical artifacts (AGENTS.md, CONSTRAINTS.md, ARCHITECTURE.md, DECISIONS.md, PROGRESS.md, SESSION-HANDOFF.md, TASK.md, features.md, feature_list.json, QUALITY.md, Makefile, scripts/init.sh, scripts/verify.sh); skip threshold 80; alwaysGenerate for blank templates; consolidator.ts merges CLAUDE.md/.cursorrules etc. into AGENTS.md and writes shims; per-subsystem score delta; --yes flag; `## SUBSYSTEM SCORES` + `## SUBSYSTEM SOURCES` in plan.md
- [x] **feat-015** — Template-based scoring: templates.ts (TEMPLATE_SUBSYSTEM_MAP, loadTemplates(), extractSectionHeadings()); scorer redesign with structural (40%) + content (60%) two-dimensional scoring; scoreStructural() exported; template section summaries in LLM system prompt; non-harness artifacts capped at 20; remediation redesign: async buildRemediationPlan(), 13-artifact canonical list, file-existence-based SKIP/IMPROVE/GENERATE, `## SKIP` section in plan.md; reporter shows template section coverage (N/M + missing names)
- [x] **feat-016** — Audit plan source cleanup: SOURCE CONTEXT dedupes by path with combined subsystems; IMPROVE source_files prefer non-empty source context over empty canonical stubs; artifact-specific fixes prevent PROGRESS.md and SESSION-HANDOFF.md guidance from being conflated
- [x] **feat-017** — Init plan contract: GENERATE/IMPROVE/SKIP/SOURCE CONTEXT parsing; graphify always-on context; LLM writes with clean output; thin-source detection; empty improve → generate
- [x] **feat-018** — File-type-aware structural scoring: detectFileType() dispatches Makefile → target check, *.sh → pattern match, *.json → key check, architecture.md → pattern check; scoreStructural() takes filename; per-file structural aggregation; verification baseline check (checkVerificationBaseline + scoreFromBaseline) replaces LLM content scoring for verification subsystem; reporter shows baseline status
- [x] **feat-019** — Expanded canonical artifact set: 19 artifacts (was 13), `generateOnly` flag for Makefile/scripts/TASK/features/QUALITY/quality-document/evaluator_rubric/clean-state-checklist/startup; removed score-gated SKIP for non-generateOnly artifacts; buildInitPlan() re-derives all decisions from CANONICAL_ARTIFACTS + filesystem; renderRemediationMarkdown shows template-copy notation for generateOnly items
- [x] **feat-020** — Heading enforcement: strict SYSTEM_PROMPT rules; corrector.ts (Dice bigram similarity + regex replace + optional LLM for missing sections); ora@5 spinner in executor.ts showing Generating.../Correcting headings... per artifact

## Backlog — Stage 3+
- Stage 3: analyze command (semantic gap analysis)
- Stage 4: drift command (stale docs detection)
- Stage 5: fix command (auto-remediation)
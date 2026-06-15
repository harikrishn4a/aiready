# PROGRESS.md — AIReady

## Current state
- Build: passing — dist/cli.js ~120 KB (full pipeline + Stage 2 bundled)
- Tests: 368/368 passing (27 test files)
- Typecheck: clean
- Lint: clean
- Last verified: 2026-06-15
- Active feature: none — **feat-021, feat-022, feat-023 complete**
- Live smoke: audit + init verified on ./betterworld via Anthropic Sonnet
  (standalone post-init audit 81/100; audit-twice variance ~3pt with temperature:0)

## Completed
- [x] Product design and stage definitions
- [x] AGENTS.md (root), docs/ARCHITECTURE.md, docs/DECISIONS.md
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
- [x] **feat-023** — Stack-aware artifacts + stable scoring + remaining-gaps UX.
  generateOnly Makefile/scripts/startup.md now rewritten with detected-stack context
  (utils/detect.ts detectStack) instead of npm template copies; Makefile recipes
  tab-repaired. mapper+scorer use temperature:0 + seed:7 and a score-band-anchored
  prompt (betterworld audit-twice variance 14pt→3pt). Scorer caps content per-file
  (6000) not per-blob (3000) so docs/ artifacts aren't crowded out by AGENTS.md
  (betterworld standalone audit 49→81). CLI: numbered critical gaps, REMAINING GAPS
  section after init re-score, non-determinism disclosure in audit+init.
- [x] **feat-023 follow-ups** — Surfaced by betterworld REMAINING GAPS:
  (1) scorer now reads non-markdown harness files (Makefile/scripts/feature_list.json)
  and prepends them, so verification is no longer blind to a generated Makefile
  (52→~85). (2) generation maxTokens 2048→4096 — generated AGENTS.md/CONSTRAINTS.md no
  longer truncated mid-section. (3) scoring maxTokens 4096 + retry-on-empty + output
  verbosity caps — fixes all-zero "LLM did not score" from JSON truncation.
  (4) stack-aware files: prompt names the repo + deterministic stripRepoPrefix() —
  Makefile recipes clean (0 `cd <repo>` / `<repo>/`). Note: init does NOT run a
  quality correction loop (deterministic heading/tab/placeholder/docs-link fixups only).

## feat-024 — Discovery + triage + feature artifacts (in progress)
- [x] **Phase A — content-based discovery layer.** Sources are found by *content*,
  not a per-subsystem name list. loader unions full md-walk + root config/manifest
  files + .github/workflows + scripts/ + graph ranking (graphify is a booster, no
  longer replaces the walk — which had hidden FEATURE_PLAN.md). mapper always triages
  but force-keeps seed files and classifies by content; prompts broadened beyond
  markdown (manifests→identity, CI/build→verification). fs skips cache/venv/tool-output
  dirs. remediation prioritises + caps subsystem sources to 12. isPlanPath no longer
  matches a user's root plan.md. Verified on betterworld: FEATURE_PLAN.md/requirements.txt/
  Dockerfile/Makefile/pytest.ini now discovered into the right subsystems.
- [x] **Phase B — non-verbatim feature artifacts.** features.md + feature_list.json are
  now subsystem 'state', generateOnly:false, generated from discovered FEATURE_PLAN/
  ROADMAP/PROGRESS sources. JSON-aware rewrite path validates with JSON.parse and falls
  back to template on invalid JSON. Verified: betterworld feature_list.json now has 5
  real features (F1/F2 etc.) from FEATURE_PLAN.md, honest not_started status.
- [x] **Phase C — gap triage.** Scorer tags each gap human|code|docs; plan/plan.md gets
  a `## GAP TRIAGE` section; audit + init CLI print grouped triage (human → user,
  code → Stage 3 analyze, docs → Stage 2). getAuditScoreDetailed returns gapTriage.
- [x] **Noise-cleanup fix.** suggestNoiseCleaning only ever suggests absorbed markdown
  docs — never config/manifest/CI/Dockerfile/scripts (Phase A made those sources).
- Live betterworld (Sonnet): audit 48 → init 82 (+34); state 35→82 (features.md/
  feature_list.json now contribute); gap triage shown in both commands.

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
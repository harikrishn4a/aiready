# PROGRESS.md — AIReady

## Current state
- Build: passing — dist/cli.js 47.35 KB (full pipeline bundled)
- Tests: 151/151 passing (12 test files)
- Typecheck: clean
- Lint: clean
- Last verified: 2026-06-05
- Active feature: none — **feat-011 complete**

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
- nothing — feat-011 complete

## Blocked
- nothing

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

## Backlog — Stage 2+
- Stage 2: init command (LLM-assisted generation)
- Stage 3: analyze command (semantic gap analysis)
- Stage 4: drift command (stale docs detection)
- Stage 5: fix command (auto-remediation)
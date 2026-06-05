# FEATURES.md — AIReady

Maintained by both human and agent.
- Human: writes initial feature definitions and acceptance criteria
- Agent: refines task breakdowns, checks off completed tasks, adds notes as work progresses

Status tracking lives in `feature_list.json`. This file is the narrative spec.

---

## feat-000: Project scaffold

**What the user sees:**
`npm run build && npm test` passes. CLI binary exists at `dist/cli.js` and responds to `--version` and `audit`.

**Tasks:**
- [x] package.json with all scripts, dependencies, devDependencies
- [x] tsconfig.json (strict, NodeNext, ESNext)
- [x] tsup.config.ts (entry src/cli.ts, format cjs, dts, clean)
- [x] eslint.config.js (typescript-eslint recommended)
- [x] vitest.config.ts (tests/)
- [x] src/cli.ts — Commander entrypoint, audit command stub
- [x] src/audit/index.ts — stub
- [x] src/init/index.ts — stub
- [x] src/analyze/index.ts — stub
- [x] src/drift/index.ts — stub
- [x] src/fix/index.ts — stub
- [x] tests/cli.test.ts — smoke test (2 passing)

**Acceptance criteria:**
- `npm run build` emits dist/cli.js with zero errors
- `npm test` passes
- `npm run typecheck` passes
- `npm run lint` passes
- `node dist/cli.js --version` prints 0.1.0

**Out of scope:**
- Any Stage 1 audit logic
- LLM dependencies

**Notes:**
Scaffold complete. Node 18 in use — ESLint 9 emits engine warning but runs cleanly.

---

## feat-001: Audit loader

**What the user sees:**
Internal module — not directly user-visible. Reads a target directory and returns structured file map for scorer.

**Tasks:**
- [ ] src/audit/loader.ts — reads AGENTS.md, ARCHITECTURE.md, CONSTRAINTS.md, PROGRESS.md, SESSION-HANDOFF.md, package.json, src/ structure
- [ ] src/utils/fs.ts — filesystem helpers (read, exists, walk)
- [ ] Unit tests for loader

**Acceptance criteria:**
- Loader returns typed data structure with all candidate files
- Loader does not throw on missing files — returns null for absent files
- `npm test` passes including loader tests

**Out of scope:**
- Scoring logic
- Output formatting

---

## feat-002: Audit scorer

**What the user sees:**
Internal module. Scores 5 subsystems (identity, verification, state, memory, constraints) from loaded files.

**Tasks:**
- [ ] src/audit/scorer.ts — pure function, same input always produces same output
- [ ] Score each subsystem 0–100 with content-aware checks (not filename presence)
- [ ] Weighted overall score
- [ ] Unit tests for each subsystem scorer

**Acceptance criteria:**
- Scorer is pure — no filesystem reads, no network calls
- All 5 subsystems return a score and a list of gaps
- `npm test` passes including scorer unit tests

**Out of scope:**
- Cross-reference validation (that's cross-ref.ts)
- Output formatting

---

## feat-003: Audit cross-ref

**What the user sees:**
Internal module. Validates that what docs claim matches project reality.

**Tasks:**
- [ ] src/audit/cross-ref.ts — validates commands in AGENTS.md exist in package.json scripts
- [ ] Validates modules in ARCHITECTURE.md match actual src/ directories
- [ ] Checks PROGRESS.md last-modified date is within 7 days
- [ ] Unit tests

**Acceptance criteria:**
- Returns structured list of passing/failing cross-reference checks
- Does not modify any file
- `npm test` passes

---

## feat-004: Audit reporter

**What the user sees:**
`npx aiready audit` prints a terminal gap report. `npx aiready audit --json` outputs valid JSON.

**Tasks:**
- [ ] src/audit/reporter.ts — formats terminal output with bar chart and gap list
- [ ] JSON output mode (--json flag)
- [ ] Wire audit command in src/cli.ts to call loader → scorer → cross-ref → reporter
- [ ] Integration test: audit command produces output

**Acceptance criteria:**
- Terminal output shows overall score, 5 subsystem scores with bar indicators, critical gaps list
- `--json` flag outputs valid JSON matching the schema in ARCHITECTURE.md
- Error messages follow the ERROR/WHY/FIX format from AGENTS.md

---

## feat-005: Stage 1 integration verification

**What the user sees:**
End-to-end verification that the audit command works correctly against real repos.

**Tasks:**
- [ ] Create examples/good-repo/ — well-harnessed sample repo for testing
- [ ] Create examples/bare-repo/ — minimal repo for testing low scores
- [ ] Verify: `npx aiready audit --target examples/good-repo` scores > 70
- [ ] Verify: `npx aiready audit --target examples/bare-repo` scores < 30
- [ ] Verify: `--min-score 80` exits with code 1 when score is below threshold
- [ ] Verify: `--json` outputs valid JSON

**Acceptance criteria:**
- All Stage 1 verification checks in PROGRESS.md pass
- Exit codes behave correctly for CI integration

**Out of scope:**
- Stage 2 (init) work

---

## feat-009: Two-stage mapper triage + token logging

**What the user sees:**
Audit completes without TPM blowups on large repos. Terminal shows `Tokens used: ~8k` at end. JSON output includes `token_usage`.

**Tasks:**
- [x] `src/utils/tokens.ts` — `estimateTokens()` (chars/4, no tiktoken)
- [x] `LLMProvider.getTotalTokens()` on Anthropic, OpenAI, Ollama providers
- [x] `mapper.ts` — triage (5-line previews) then classify (50-line previews)
- [x] `index.ts` — log token total after report; pass to JSON output
- [x] Tests: tokens, mapper two-stage, llm token counter, reporter token_usage

**Acceptance criteria:**
- `npm run build && npm test && npm run typecheck && npm run lint` all pass
- Empty triage result skips classification and returns empty mappings
- Full file content still flows to scorer for mapped files only

**Out of scope:**
- Stage 2 (init) work
- Changes to loader.ts, scorer.ts, cli.ts

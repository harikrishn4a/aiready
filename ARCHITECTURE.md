# ARCHITECTURE.md — AIReady

## Overview
AIReady is a CLI tool that evaluates and improves repository readiness
for AI coding agents. It reads a target repository, scores it against
a harness model, and generates or repairs the artifacts that make agents
reliable across sessions.

The tool never modifies the target repository without explicit confirmation.
All write operations require `--force` or a user prompt.

---

## Product stages

| Stage | Command | What it does | Status |
|---|---|---|---|
| 1 | `npx aiready audit` | LLM-powered audit — scores 5 harness subsystems, writes `.aiready/plan.md` | **complete** |
| 2 | `npx aiready init` | Reads plan.md + source context, generates missing harness artifacts | **current** |
| 3 | `npx aiready analyze` | Reads code + Graphify graph, finds undocumented intent, writes `.aiready/gaps.md` | not started |
| 4 | `npx aiready drift` | Reads harness + git history, finds stale docs, writes `.aiready/drift.md` | not started |
| 5 | `npx aiready fix` | Reads plan/gaps/drift, patches exactly what's wrong, shows diff before write | not started |

Each stage reads the output artifact of the previous stage. The stages form a pipeline:
`plan.md → gaps.md → drift.md → patch`.

---

## Module map

```
src/
  cli.ts           ← Commander entrypoint. Registers all commands.
                     Loads dotenv first (import 'dotenv/config').
                     Routes flags to the correct stage module.
                     No business logic here.

  audit/           ← Stage 1. LLM-powered pipeline.
    index.ts       ← audit command handler. Builds config, runs pipeline,
                     writes .aiready/plan.md, handles spinner + exit codes.
    loader.ts      ← reads target repo files into memory. Synchronous.
                     Graphify-aware: uses graph.json for semantic file ranking
                     when present; falls back to walking all .md files.
    mapper.ts      ← two-stage LLM pipeline: triage (filename filter) →
                     classify (subsystem assignment). Content-signal fallback
                     via SUBSYSTEM_SIGNAL_PATTERNS. Uses { fast: true }.
    scorer.ts      ← LLM quality scoring per subsystem using full file content.
                     Strict course-aligned prompt. Returns score 0–100 + findings.
    cross-ref.ts   ← validates commands and modules against project reality.
                     Falls back to mapped files when canonical names absent.
    reporter.ts    ← formats terminal (multi-line) and JSON output.
    remediation.ts ← builds typed remediation contract (generate / improve /
                     source_context). Writes .aiready/plan.md. max_lines: 300.

  init/            ← Stage 2. LLM-assisted. Reads .aiready/plan.md.
                     Generates missing harness artifacts from source context.
                     Never overwrites without --force. (in progress)

  analyze/         ← Stage 3. LLM-assisted. Reads code + Graphify graph.
                     Finds undocumented intent. Writes .aiready/gaps.md. (stub)

  drift/           ← Stage 4. LLM-assisted. Reads harness + git history.
                     Finds stale docs. Writes .aiready/drift.md. (stub)

  fix/             ← Stage 5. LLM-assisted. Reads plan/gaps/drift.
                     Patches exactly what's wrong. Shows diff before write. (stub)

  utils/
    llm.ts         ← LLMProvider interface + AnthropicProvider / OpenAIProvider /
                     OllamaProvider. ONLY file that imports @anthropic-ai/sdk or openai.
                     getTotalTokens() for session-scoped token tracking.
    prompt.ts      ← interactive provider/model selection via @inquirer/prompts.
                     selectAuditConfig() returns AuditConfig { provider, modelId }.
    models.ts      ← versioned Anthropic model list + OpenAI fallback list.
    tokens.ts      ← token estimation: Math.ceil(chars / 4).
    spinner.ts     ← TTY-only sea-green spinner. Silent in JSON/CI mode.
    fs.ts          ← filesystem helpers (readFile, exists, listDirs, listFiles,
                     statMtime, walkMdFiles).
    detect.ts      ← stack and package manager detection.
```

---

## Stage designs

### Stage 1 — audit (complete)
`npx aiready audit [--target DIR] [--json] [--min-score N] [--provider P] [--model M]`

**Input:** path to a target repository (default: cwd)

**Pipeline:**
```
target repo
    ↓
loader.ts        reads all candidate files into memory (synchronous)
                 Graphify path: graph.json → semantic label scoring → top-ranked .md files
                 Fallback path: walk all .md files in repo
                 Always includes guaranteed harness filenames (AGENTS.md, PROGRESS.md, etc.)
    ↓
mapper.ts        LLM triage (filenames → harness-relevant subset, fast model)
                 LLM classify (50-line previews → subsystem assignments, fast model)
                 Content-signal augmentation (full-file regex, catches sections triage missed)
                 When usedGraphify=true: skips triage entirely
    ↓
scorer.ts        LLM quality scoring per subsystem (full mapped file content)
                 Strict prompt: scores on depth, not presence
                 Returns score 0–100 per subsystem + findings text + gaps list
    ↓
cross-ref.ts     Validates commands from AGENTS.md/identity-mapped files exist in package.json
                 Validates modules from ARCHITECTURE.md/memory-mapped files match src/ dirs
                 Checks PROGRESS.md freshness (within 7 days)
    ↓
remediation.ts   Builds typed contract: generate / improve / source_context
                 Writes .aiready/plan.md (markdown, human-readable)
    ↓
reporter.ts      Prints multi-line subsystem scores to terminal
                 JSON mode: full structured output with token_usage, remediation, plan_path
```

**The 5 subsystems scored:**

| Subsystem | What it measures |
|---|---|
| identity | Does an agent know what this project is? (description, stack, structure) |
| verification | Can an agent confirm its work is correct? (commands, runnable, in package.json) |
| state | Can an agent resume without starting blind? (progress freshness, handoff present) |
| memory | Can an agent navigate without exploring? (architecture doc, module map) |
| constraints | Does an agent know what it must never do? (MUST NOT language, hard limits) |

**Output files written by Stage 1:**
- `.aiready/plan.md` — remediation contract (missing artifacts, weak artifacts, source context)

**Exit codes:**
- `0` — always, unless `--min-score N` is passed and the score falls below N

---

### Stage 2 — init (current)
`npx aiready init [--target DIR] [--force] [--provider P] [--model M]`

**Input:** `.aiready/plan.md` written by Stage 1 + source context files listed in the plan

**Pipeline:**
```
.aiready/plan.md
    ↓
read generate / improve lists + source_context files
    ↓
for each artifact to generate:
    build prompt from examples/ template + source context
    LLM generates content (capped at 300 lines)
    write to target repo (skip if exists and --force not passed)
for each artifact to improve:
    read existing file + build improvement prompt
    LLM rewrites weak sections only
    show diff, write on confirmation
```

**Rules:**
- Never overwrites existing files without `--force`
- Each generated artifact is capped at 300 lines
- Uses `examples/` directory as generation templates
- Source context files are read-only inputs — never modified

---

### Stage 3 — analyze (not started)
`npx aiready analyze [--target DIR] [--provider P] [--model M]`

**Input:** repo source code + Graphify graph (when present)

Reads code and existing docs, finds semantic gaps: things the code does
that are undocumented or inadequately explained. Writes `.aiready/gaps.md`.

---

### Stage 4 — drift (not started)
`npx aiready drift [--target DIR] [--since DAYS] [--provider P] [--model M]`

**Input:** harness docs + git history

Compares current codebase against harness docs. Reports where reality has
diverged from what is written. Designed to run in CI on a schedule.
Writes `.aiready/drift.md`.

---

### Stage 5 — fix (not started)
`npx aiready fix [--target DIR] [--gaps] [--drift] [--provider P] [--model M]`

**Input:** `.aiready/plan.md` and/or `.aiready/gaps.md` and/or `.aiready/drift.md`

Takes output of audit/analyze/drift and patches exactly what's wrong.
Shows a diff before writing. User confirms before any file is touched.

---

## Layer boundaries

### cli.ts
- MUST only register commands and route to stage modules
- MUST NOT contain scoring, file reading, or formatting logic
- MUST NOT import from stage modules other than their index.ts
- MUST load `dotenv/config` before any other import

### audit/loader.ts
- MUST only read files — no scoring, no LLM calls, no output
- MUST remain synchronous (no async/await)
- MUST NOT write to the target repository
- MUST return a plain data structure, not a formatted string

### audit/mapper.ts
- MUST accept `LLMProvider` — never a raw API key
- MUST NOT read from the filesystem directly
- Content-signal detection reads `fullContent` from `RepoFile` objects passed in

### audit/scorer.ts
- MUST accept `LLMProvider` — never a raw API key
- MUST NOT read from the filesystem directly
- MUST NOT call `crossRef()` — scorer is pure quality, cross-ref is structural validation

### audit/cross-ref.ts
- MUST only validate — no scoring, no LLM calls, no output
- MUST NOT modify any file
- Falls back to mapped file content when canonical filenames are absent

### audit/reporter.ts
- MUST only format and print — no business logic
- MUST support both terminal and JSON output modes

### audit/remediation.ts
- MUST only build the remediation contract and write `.aiready/plan.md`
- MUST NOT read source files directly (works from scorer/cross-ref output)

### utils/llm.ts
- ONLY file that may import `@anthropic-ai/sdk` or `openai`
- All other modules receive an `LLMProvider` interface

---

## Key dependencies

| Dependency | Purpose |
|---|---|
| `commander` | CLI argument parsing and command registration |
| `@anthropic-ai/sdk` | Anthropic LLM calls (AnthropicProvider) |
| `openai` | OpenAI + Ollama LLM calls (OpenAIProvider, OllamaProvider) |
| `@inquirer/prompts` | Interactive provider/model selection |
| `dotenv` | `.env` file loading at startup |
| `typescript` | Language (strict mode) |
| `vitest` | Testing |
| `tsup` | Build and bundle to dist/ |
| `eslint` | Linting |

## Decision log
See `DECISIONS.md` for rationale on key architectural choices.

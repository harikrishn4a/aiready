# ARCHITECTURE.md — AIReady

## Overview
AIReady is a CLI tool that evaluates and improves repository readiness
for AI coding agents. It reads a target repository, scores it against
a harness model, and generates or repairs the artifacts that make agents
reliable across sessions.

The tool never modifies the target repository without explicit confirmation.
All write operations require `--force` or a user prompt.

---

## Module map

```
src/
  cli.ts           ← Commander entrypoint. Registers all commands.
                     Routes flags to the correct stage module.
                     No business logic here.

  audit/           ← Stage 1. Deterministic, LLM-free.
    index.ts       ← audit command handler
    loader.ts      ← reads target repo files into memory
    scorer.ts      ← scores 5 subsystems, returns structured result
    cross-ref.ts   ← validates docs against actual project files
    reporter.ts    ← formats and prints the gap report to terminal

  init/            ← Stage 2. LLM-assisted. (stub)
  analyze/         ← Stage 3. LLM-assisted. (stub)
  drift/           ← Stage 4. LLM-assisted. (stub)
  fix/             ← Stage 5. LLM-assisted. (stub)

  utils/
    fs.ts          ← filesystem helpers (read, exists, walk)
    detect.ts      ← stack and package manager detection
    args.ts        ← shared CLI argument parsing helpers
```

---

## Stage designs

### Stage 1 — audit
`npx aiready audit [--target DIR] [--json] [--min-score N]`

**Input:** path to a target repository (default: cwd)

**Pipeline:**
```
target repo
    ↓
loader.ts        reads all candidate files into memory
    ↓
scorer.ts        scores 5 subsystems against loaded files
    ↓
cross-ref.ts     validates commands and modules against project reality
    ↓
reporter.ts      prints gap report to terminal
```

**The 5 subsystems scored:**

| Subsystem | What it measures | Key checks |
|---|---|---|
| identity | Does an agent know what this project is? | Project description length, stack section, version numbers present |
| verification | Can an agent confirm its work is correct? | Commands present, commands exist in package.json, commands are runnable |
| state | Can an agent resume without starting blind? | progress.md exists and is fresh, session-handoff.md exists |
| memory | Can an agent navigate without exploring? | architecture.md present, module docs present, key files called out |
| constraints | Does an agent know what it must never do? | CONSTRAINTS.md present, uses MUST/MUST NOT language |

**Scoring model:**
- Each subsystem scores 0–100 based on content-aware checks, not filename presence
- Overall score is a weighted average across all 5 subsystems
- Score reflects harness quality, not harness existence

**Cross-reference checks (docs vs reality):**
- Commands mentioned in AGENTS.md exist in package.json scripts
- Modules documented in ARCHITECTURE.md match actual src/ directories
- progress.md last-modified date is within 7 days

**Output — terminal (default):**
```
AI Readiness: 47/100

identity       ████░░░░░░  40   No stack section. Description too short.
verification   ████████░░  75   Commands present. `npm run typecheck` not in package.json.
state          ░░░░░░░░░░   0   No progress.md. No session-handoff.md.
memory         ██░░░░░░░░  20   No architecture.md. No module docs.
constraints    ██████░░░░  60   CONSTRAINTS.md present. Missing MUST NOT language.

Critical gaps:
  ✗ No progress.md — agents cannot resume sessions
  ✗ `npm run typecheck` not found in package.json scripts
  ✗ No module docs under src/

Run `npx aiready init` to generate missing artifacts.
```

**Output — JSON (--json flag):**
```json
{
  "overall": 47,
  "subsystems": {
    "identity": { "score": 40, "gaps": [...] },
    "verification": { "score": 75, "gaps": [...] },
    "state": { "score": 0, "gaps": [...] },
    "memory": { "score": 20, "gaps": [...] },
    "constraints": { "score": 60, "gaps": [...] }
  },
  "crossReference": { "checks": [...] },
  "recommendation": "Improve state subsystem before relying on agents for long-running tasks."
}
```

**Exit codes:**
- `0` — score meets or exceeds `--min-score` (default 70)
- `1` — score below threshold (enables CI integration)

---

### Stage 2 — init (design, not yet built)
`npx aiready init [--target DIR] [--force]`

LLM reads actual code and generates missing harness artifacts.
Detects stack, extracts module responsibilities, writes:
- `AGENTS.md` with real stack, real commands, real structure
- `ARCHITECTURE.md` with actual module map
- `CONSTRAINTS.md` with domain-specific hard limits
- `progress.md`, `session-handoff.md` as blank templates
- `features.md` and `feature_list.json` as blank templates

Never overwrites existing files unless `--force` is passed.

---

### Stage 3 — analyze (design, not yet built)
`npx aiready analyze [--target DIR]`

LLM reads code and existing docs, finds semantic gaps:
things the code does that are undocumented or inadequately explained.
Outputs a list of undocumented intent, missing runbooks, risky areas.

---

### Stage 4 — drift (design, not yet built)
`npx aiready drift [--target DIR] [--since DAYS]`

Compares current codebase against harness docs.
Reports where reality has diverged from what is written.
Designed to run in CI on a schedule.

---

### Stage 5 — fix (design, not yet built)
`npx aiready fix [--target DIR] [--gaps] [--drift]`

Takes output of audit, analyze, or drift and patches it.
Shows a diff before writing. User confirms before any file is touched.

---

## Layer boundaries

### cli.ts
- MUST only register commands and route to stage modules
- MUST NOT contain scoring, file reading, or formatting logic
- MUST NOT import from stage modules other than their index.ts

### audit/loader.ts
- MUST only read files — no scoring, no output
- MUST NOT write to the target repository
- MUST return a plain data structure, not a formatted string

### audit/scorer.ts
- MUST be pure — same input always produces same output
- MUST NOT read from the filesystem directly (loader.ts handles that)
- MUST NOT make network requests or LLM calls

### audit/cross-ref.ts
- MUST only validate — no scoring, no output
- MUST NOT modify any file

### audit/reporter.ts
- MUST only format and print — no business logic
- MUST support both terminal and JSON output modes

---

## Key dependencies

| Dependency | Version | Purpose |
|---|---|---|
| commander | ^12 | CLI argument parsing and command registration |
| typescript | ^5 | Language |
| vitest | ^1 | Testing |
| tsup | ^8 | Build and bundle to dist/ |
| eslint | ^9 | Linting |

No LLM dependencies in Stage 1.
Stage 2+ will add the Anthropic TypeScript SDK.

## Decision log
See `DECISIONS.md` for rationale on key architectural choices.
> Note: aiready audit recognises AGENTS.md, CLAUDE.md, AGENT.md,
> .cursorrules, and .windsurfrules as valid entry points.
> AGENTS.md is recommended for broadest agent compatibility.

# AGENTS.md — AIReady

## What this is
CLI tool that audits repositories for AI agent readiness and generates
harness artifacts so coding agents can work effectively across sessions.
Outputs AGENTS.md, module docs, verification commands, and session state
files. Distributed via npx — zero install required.

## Product stages
AIReady is built in 5 stages. Each stage is a separate src/ module.
Do not implement code for a future stage while working on the current one.

| Stage | Command | What it does | Status |
|---|---|---|---|
| 1 | `npx aiready audit` | Deterministic repo audit — scores 5 harness subsystems, no LLM | **current** |
| 2 | `npx aiready init` | Generates missing harness artifacts from actual code, LLM-assisted | not started |
| 3 | `npx aiready analyze` | Semantic gap analysis — finds undocumented intent in code | not started |
| 4 | `npx aiready drift` | Detects stale docs vs code changes over time | not started |
| 5 | `npx aiready fix` | Auto-remediates gaps found by audit, analyze, or drift | not started |

See `ARCHITECTURE.md` for full design detail on each stage.

## Current stage
Stage 1 — deterministic repo audit. No LLM. Scores a repo against 5
harness subsystems and outputs a gap report to terminal.

The 5 subsystems scored:
- **identity** — does an agent know what this project is and does?
- **verification** — can an agent confirm its work is correct?
- **state** — can an agent resume a session without starting blind?
- **memory** — can an agent navigate the codebase without exploring?
- **constraints** — does an agent know what it must never do?

Current status: scaffolding phase. No src/ yet.
See PROGRESS.md for task breakdown.

## Stack
- Node.js 20+, TypeScript (strict)
- Commander.js — CLI framework
- Vitest — testing
- tsup — build/bundle to dist/
- ESLint — linting
- No LLM dependencies in Stage 1

## Repo structure
```
aiready/
  src/
    audit/           ← Stage 1: scoring logic
    init/            ← Stage 2: file generation (stub only)
    analyze/         ← Stage 3: semantic gap analysis (stub only)
    drift/           ← Stage 4: drift detection (stub only)
    fix/             ← Stage 5: auto-remediation (stub only)
    cli.ts           ← entrypoint, Commander setup
    utils/           ← shared helpers
  examples/          ← harness templates (reference, not src)
  tests/
  AGENTS.md          ← this file
  PROGRESS.md        ← project state
  SESSION-HANDOFF.md ← last session state
  DECISIONS.md       ← key design choices with rationale
  ARCHITECTURE.md    ← full stage design and data flow
  feature_list.json  ← feature tracker
  features.md        ← feature definitions
```

---

## Session start
1. Run `pwd` — confirm you are in the repo root
2. Read this file completely
3. Read `PROGRESS.md` — understand current state
4. Read `SESSION-HANDOFF.md` — see what the last session left
5. Run `git log --oneline -5` — see recent changes
6. Run `npm run build && npm test` — confirm baseline is not broken
7. Read `feature_list.json` — identify the current active feature
8. Pick exactly one unfinished feature. Work only that until verified or blocked.

If baseline verification is failing, repair that first before adding new scope.

## Session end
1. Run full verification (see Verification Commands below)
2. Update `PROGRESS.md` if a feature completed, was added, or got blocked
3. Update `features.md` — check off completed tasks, add implementation notes
4. Update `feature_list.json` — set new status and record evidence
5. Overwrite `SESSION-HANDOFF.md` with this session's state
6. If a key decision was made, append it to `DECISIONS.md`
7. Commit with a descriptive message — leave a clean restart path

## Working rules
- One active feature at a time — never work on two features in parallel
- Before starting a feature, generate a sprint contract and save it to `TASK.md`
- Do not claim completion without runnable verification evidence
- Do not rewrite `PROGRESS.md` to hide unfinished work
- Do not remove or weaken tests to make a task appear complete
- Stay in scope — do not modify files unrelated to the current feature

## Completion gate
A feature moves to `passing` only when ALL of the following are true:
- [ ] Target behavior is implemented
- [ ] All verification commands pass (see below)
- [ ] Tasks checked off in `features.md`
- [ ] Evidence recorded in `feature_list.json`
- [ ] Repository is restartable from `npm run build && npm test`

## Verification commands
```bash
npm run build     # tsc + tsup, must emit zero errors
npm run typecheck # tsc --noEmit --strict
npm run lint      # eslint src/, must be clean
npm test          # vitest, must pass
```

## Escalation
- **Architecture decisions**: Check `DECISIONS.md`, then ask the user
- **Unclear requirements**: Check `features.md` for the feature definition, then ask the user
- **Repeated failures**: Mark feature as blocked in `feature_list.json`, flag for human review
- **Scope ambiguity**: Re-read `TASK.md` sprint contract before expanding scope

## Constraints — never do these
- MUST NOT write to the target repo without `--force` or explicit user confirmation
- MUST NOT run verification commands in the target repo automatically
- MUST NOT overwrite existing harness files unless `--force` is passed
- MUST NOT make API calls or network requests in Stage 1 — LLM-free only
- MUST NOT add new dependencies without recording the decision in `DECISIONS.md`
- MUST NOT claim completion without runnable evidence
- MUST NOT implement Stage 2+ code while Stage 1 is in progress

## Error message format
All errors emitted by the CLI must follow this structure:

```
ERROR: <what was found and where>
WHY:   <why this is a problem>
FIX:   <exact action to resolve it>
```

Example:
```
ERROR: Verification command `npm run typecheck` in AGENTS.md not found in package.json scripts
WHY:   Agent will try to run a command that does not exist, wasting context on a fixable error
FIX:   Add "typecheck": "tsc --noEmit" to package.json scripts, or update AGENTS.md to match
```
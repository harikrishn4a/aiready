> **Example** — Replace all `{{PLACEHOLDERS}}` and adapt commands to the actual project's stack and toolchain.
 
# AGENTS.md
 
## What this is
{{ONE_PARAGRAPH_DESCRIPTION}}
What the product does, who it is for, and what problem it solves.
 
## Current stage
{{WHAT_IS_BEING_BUILT_RIGHT_NOW}}
Name the specific stage or milestone actively under development.
Example: "Stage 1 — CLI audit command. Deterministic, no LLM. Scores repo against 5 harness subsystems."
 
## Stack
- {{LANGUAGE_AND_RUNTIME}}
- {{FRAMEWORK_OR_KEY_LIBRARIES}}
- {{DATABASE_OR_STORAGE_IF_APPLICABLE}}
- {{TEST_RUNNER}}
- {{BUILD_TOOL}}
## Repo structure
```
{{PROJECT_ROOT}}/
  src/
    {{MODULE}}/        — {{RESPONSIBILITY}}
    {{MODULE}}/        — {{RESPONSIBILITY}}
  tests/
  {{HARNESS_FILES}}    — AGENTS.md, PROGRESS.md, DECISIONS.md, etc.
```
 
---

## Session start
1. Run `pwd` — confirm you are in the repo root
2. Read this file completely
3. Read `PROGRESS.md` — understand current state
4. Read `SESSION-HANDOFF.md` — see what the last session left
5. Run `git log --oneline -5` — see recent changes
6. Run `./init.sh` — confirm baseline is not broken
7. Read `feature_list.json` — identify the current active feature
8. Pick exactly one unfinished feature. Work only that until verified or blocked.

If baseline verification is failing, repair that first before adding new scope.

## Session end
1. Run full verification (see Verification Commands below)
2. Update `PROGRESS.md` if a feature completed, was added, or got blocked
3. Update `features.md` — check off completed tasks, add implementation notes
4. Update `feature_list.json` — set new status and record evidence
5. Overwrite `SESSION-HANDOFF.md` with this session's state
6. Commit with a descriptive message — leave a clean restart path

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
- [ ] Repository is restartable from `./init.sh`

## Verification commands
```bash
{{PRIMARY_VERIFICATION_COMMAND}}
```

Required checks:
{{VERIFICATION_COMMANDS}}

## Escalation
- **Architecture decisions**: Check `DECISIONS.md`, then ask the user
- **Unclear requirements**: Check `features.md` for the feature definition, then ask the user
- **Repeated failures**: Mark feature as blocked in `feature_list.json`, flag for human review
- **Scope ambiguity**: Re-read `TASK.md` sprint contract before expanding scope

## Constraints
See `CONSTRAINTS.md` for hard limits that must never be violated.
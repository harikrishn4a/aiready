> **Example** — Replace `{{DOMAIN_SPECIFIC_SECTION}}` and `{{CONSTRAINT}}` with real project-specific hard limits.

# CONSTRAINTS.md

Hard limits for this repository. Agents MUST follow these without exception.
Use MUST / MUST NOT language only. No ambiguity.

## Scope
- MUST work on exactly one feature at a time
- MUST NOT modify files outside the current feature scope
- MUST NOT refactor unrelated code during a feature implementation

## Verification
- MUST run all verification commands before marking a feature done
- MUST NOT remove or weaken tests to make a task appear complete
- MUST NOT claim completion without runnable evidence

## Artifacts
- MUST update `features.md` task checkboxes and notes before ending a session
- MUST update `feature_list.json` status and evidence before ending a session
- MUST NOT rewrite `PROGRESS.md` to hide unfinished work or failed checks
- MUST NOT delete any project file without explicit user instruction

## Dependencies
- MUST NOT add new dependencies without recording the decision in `DECISIONS.md`
- MUST NOT upgrade existing dependencies mid-feature

## {{DOMAIN_SPECIFIC_SECTION}}
- MUST NOT {{CONSTRAINT}}
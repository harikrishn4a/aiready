# TASK.md — feat-012: Stage 2 init command

## Feature ID
feat-012

## Goal
Implement `npx aiready init --target .` — reads `.aiready/plan.md` (written by Stage 1 audit),
executes the remediation contract, and generates or improves missing harness artifacts using LLM.

## Design principles
- One artifact per LLM call — never batch multiple artifacts
- Read source files fresh from disk before each call
- Write each artifact before moving to the next
- Re-run audit after all artifacts written — show before/after score
- Never overwrite existing files unless --force is passed
- --force can target a single file: --force CONSTRAINTS.md

## Modules to create

| File | Responsibility |
|---|---|
| `src/init/parser.ts` | Parse `.aiready/plan.md` into typed `InitPlan` |
| `src/init/generator.ts` | Generate new artifact from template + source context (1 LLM call) |
| `src/init/improver.ts` | Improve a section of an existing artifact (1 LLM call) |
| `src/init/executor.ts` | Write lifecycle — skip/force logic, console output, file writes |
| `src/init/scorer.ts` | Lightweight re-audit: returns `overall` score using existing audit pipeline |
| `src/init/index.ts` | Main entry point: orchestrates the full init flow |

## CLI registration
- `src/cli.ts` — add `init` command with `--target`, `--provider`, `--model`, `--force [filename]`, `--dry-run`

## Completion gate
- [ ] `npm run build` — zero errors
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run lint` — clean
- [ ] `npm test` — all pass, no regressions
- [ ] `node dist/cli.js init --target ./examples/bare-repo --dry-run` shows plan

# TASK.md — feat-018: File-type-aware structural scoring + verification baseline

## Feature ID
feat-018

## Scope — what will change
- UPDATED `src/audit/templates.ts` — FileType enum, detectFileType(), REQUIRED_MAKEFILE_TARGETS, REQUIRED_INIT_SH_PATTERNS, REQUIRED_VERIFY_SH_PATTERNS, REQUIRED_JSON_KEYS
- UPDATED `src/audit/scorer.ts` — file-type-aware scoreStructural() dispatch; scoreMakefileStructure(), scoreShellStructure(), scoreJsonStructure(), scoreArchitectureStructure(); verification subsystem uses baseline check
- UPDATED `tests/templates.test.ts` — new detectFileType and required pattern tests
- UPDATED `tests/scorer.test.ts` — new Makefile/shell/JSON/architecture structural scoring tests

## Problems being fixed
1. Structural scoring uses ## headings for ALL files — Makefile gets 0 because it has no headings
2. Verification scores documentation quality instead of asking: is there a runnable baseline?
3. architecture.md template is one minimal layer example — scorer penalises multi-layer files for not matching minimal structure

## Design decisions
- detectFileType() dispatches on filename: Makefile → 'makefile', *.sh → 'shell', *.json → 'json', *.md → 'markdown', else → 'other'
- REQUIRED_MAKEFILE_TARGETS: ['setup', 'dev', 'check|verify', 'test', 'lint', 'clean'] (pipe = alias)
- Makefile structural scoring: extract defined targets, check required, score = present/total × 100
- Shell structural scoring: regex pattern matching against REQUIRED_INIT_SH_PATTERNS or REQUIRED_VERIFY_SH_PATTERNS
- JSON structural scoring: check required top-level keys for known files (feature_list.json)
- Architecture markdown: score on Responsibilities + Must NOT + module table + data flow pattern, not exact headings
- scoreStructural() now takes filename as first arg (breaking change — exported, update callers)
- Verification baseline: commandExists + documented + crossRefs → 'established'/'partial'/'missing'
  - 'established' (all three): 90
  - 'partial' (commandExists only): 40-60
  - 'missing': 10
- combineScores() unchanged (40/60 split)

## Modules (in order)
1. src/audit/templates.ts — add FileType + detection + required patterns
2. src/audit/scorer.ts — file-type-aware dispatch + architecture special case + verification baseline
3. Tests updated throughout

## Completion gate
- npm run build — zero errors
- npm run typecheck — zero errors
- npm run lint — clean
- npm test — all pass including new tests

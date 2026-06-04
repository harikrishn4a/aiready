# TASK.md — Sprint Contract

## Feature
- ID: feat-005
- Title: Stage 1 integration — end-to-end audit verification

## Scope — what will change
- test-fixtures/good-repo/ — well-harnessed fixture repo
- test-fixtures/bare-repo/ — minimal fixture repo
- tests/integration.test.ts — end-to-end tests

## Exclusions — what will NOT change
- No src/ changes
- examples/ directory not modified
- No Stage 2 work

## Verification standard
- npm run build
- npm test (including integration tests)
- npm run typecheck
- npm run lint
- node dist/cli.js audit --target test-fixtures/good-repo scores > 70
- node dist/cli.js audit --target test-fixtures/bare-repo scores < 30
- node dist/cli.js audit --target test-fixtures/bare-repo exits with code 1
- node dist/cli.js audit --target test-fixtures/good-repo --json outputs valid JSON

## Acceptance criteria
- good-repo fixture scores > 70 via pipeline AND via CLI binary
- bare-repo fixture scores < 30 via pipeline
- --min-score flag causes exit 1 when score is below threshold
- --json outputs parseable JSON with the expected schema

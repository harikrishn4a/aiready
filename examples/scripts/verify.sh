#!/usr/bin/env bash
# verify.sh — full verification path
#
# PURPOSE: Agents run this before marking any feature done.
# All checks must pass. If any fail, the feature is not complete.
# This script is also called by init.sh at session start.
#
# HOW TO ADAPT: Replace each section with your stack's equivalent commands.
# Keep the section structure (build → typecheck → lint → test) — the order
# matters because faster/cheaper checks should fail before slower ones.
#
# The LLM generating this for your project should:
# - Use your actual package manager (npm/pnpm/yarn/bun/pip/cargo/etc.)
# - Use your actual test runner (jest/vitest/pytest/go test/cargo test/etc.)
# - Use your actual lint tool (eslint/ruff/golangci-lint/clippy/etc.)
# - Include typecheck if your stack supports it (tsc/mypy/go vet/etc.)
# - Remove sections that don't apply to your stack

set -e

echo "=== Build ==="
# Replace with your build command, or remove if your stack has no build step
# Examples: npm run build / cargo build / go build ./...
npm run build

echo "=== Type check ==="
# Replace with your typecheck command, or remove if not applicable
# Examples: npm run typecheck / mypy src/ / go vet ./...
npm run typecheck

echo "=== Lint ==="
# Replace with your lint command, or remove if not applicable
# Examples: npm run lint / ruff check . / golangci-lint run
npm run lint

echo "=== Tests ==="
# Replace with your test command — this one is required, never remove it
# Examples: npm test / pytest / go test ./... / cargo test
npm test

echo ""
echo "=== All checks passed ==="
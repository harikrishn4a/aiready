# Makefile — standardized commands for agents and humans
#
# PURPOSE: Every common action has a named target here.
# Agents use these instead of remembering raw commands.
# AGENTS.md verification section should reference these targets.
#
# HOW TO ADAPT: Replace the commands inside each target with your
# stack's equivalents. Keep the target names — agents expect them.
# Add stack-specific targets below the standard ones.
#
# REQUIRED TARGETS (keep these, adapt the commands):
#   setup    — install all dependencies from scratch
#   dev      — start development server / watch mode
#   check    — run full verification (build + typecheck + lint + test)
#   test     — run tests only
#   lint     — run linter only
#   clean    — remove build artifacts
#
# OPTIONAL TARGETS (add what your stack needs):
#   build    — compile/bundle for production
#   typecheck — type checking only
#   format   — auto-format code

.PHONY: setup dev check test lint clean build typecheck format

## Install all dependencies from scratch
## Agents run this when setting up for the first time
setup:
	./scripts/init.sh

## Start development server or watch mode
## Replace with your stack's dev command
## Examples: npm run dev / uvicorn main:app --reload / air
dev:
	npm run dev

## Full verification — build + typecheck + lint + test
## Agents run this before marking any feature done
## This is the canonical "am I done?" command
check:
	./scripts/verify.sh

## Run tests only
## Use when iterating on a specific feature
test:
	npm test

## Run linter only
## Use when cleaning up before commit
lint:
	npm run lint

## Type checking only
## Remove this target if your stack has no type checker
typecheck:
	npm run typecheck

## Auto-format code
## Remove this target if your stack has no formatter
format:
	npm run format

## Compile or bundle for production
## Remove this target if your stack has no build step
build:
	npm run build

## Remove build artifacts and caches
## Safe to run at any time — does not affect source files
clean:
	rm -rf dist/ .cache/ coverage/
	# Replace with your stack's clean command
	# Examples: cargo clean / go clean ./... / find . -name __pycache__ -rm
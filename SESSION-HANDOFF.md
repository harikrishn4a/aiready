# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-007 complete** — Provider abstraction with interactive selection and dotenv
- **feat-008 complete** — Dynamic OpenAI model list + versioned Anthropic model list

### feat-008 changes
#### New files
- `src/utils/models.ts` — `ModelDef` interface, `ANTHROPIC_MODELS` (5 models, versioned), `OPENAI_FALLBACK_MODELS` (4 models). Single file to update when adding new models.

#### Modified files
- `src/utils/llm.ts` — added `modelId?` param to `AnthropicProvider` and `OpenAIProvider` constructors (when set, overrides `fast` hint entirely); added `listOpenAIModels(apiKey)` that calls `client.models.list()` filtered to `gpt-*` chat models sorted newest-first with static fallback on error; `createProvider()` now accepts optional `modelId` third arg
- `src/utils/prompt.ts` — `AuditConfig.modelId: string` replaces `modelTier: ModelTier`; `promptModelId()` fetches live models for OpenAI, uses static list for Anthropic; API key checked BEFORE model selection so OpenAI can use the key to fetch its model list
- `src/audit/index.ts` — passes `config.modelId` to `createProvider`
- `src/cli.ts` — updated `--model` description
- `tests/llm.test.ts` — rewritten: OpenAI mock now includes `models.list` mock; added `modelId` override tests, `listOpenAIModels` tests (filter, sort, fallback on error, fallback on empty)
- `tests/prompt.test.ts` — updated: all `modelTier` assertions → `modelId`; select mocks return real model IDs; added OLLAMA_MODEL env var test

### feat-007 new files (reference)
- `src/utils/llm.ts` — `LLMProvider` interface + `AnthropicProvider` + `OpenAIProvider` + `OllamaProvider` + `createProvider()` factory. This is the ONLY file that imports `@anthropic-ai/sdk` or `openai`.
- `src/utils/prompt.ts` — `selectAuditConfig()`: shows interactive provider/model selection via `@inquirer/prompts` if flags are omitted; checks env var for chosen provider; exits 1 with ERROR/WHY/FIX + provider URL + Ollama suggestion if key missing.
- `.env.example` — template for ANTHROPIC_API_KEY, OPENAI_API_KEY, OLLAMA_HOST, OLLAMA_MODEL, OPENAI_BASE_URL
- `tests/llm.test.ts` — 23 tests: model selection, modelId override, prompt caching, response parsing, listOpenAIModels, createProvider factory
- `tests/prompt.test.ts` — 11 tests: flag passthrough, API key gate per provider, Ollama no-key, OLLAMA_MODEL env var, interactive prompts

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 26.66 KB, zero errors |
| `npm test` | pass — 121/121 (9 test files) |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |

## What is broken or unverified
- Real LLM calls still not tested in automated suite (all mocked)
- Interactive prompts not tested end-to-end (inquirer mocked in tests)
- Ollama provider not tested against a live Ollama instance

## Manual smoke test (requires .env or exported key)
```bash
# Anthropic — interactive model selection from versioned list
node dist/cli.js audit --target examples/good-repo --provider anthropic

# Anthropic — skip prompt with explicit model
node dist/cli.js audit --target examples/good-repo --provider anthropic --model claude-sonnet-4-6

# OpenAI — interactive: fetches live model list from /v1/models
node dist/cli.js audit --target examples/good-repo --provider openai

# Ollama (local) — no key needed
node dist/cli.js audit --target examples/bare-repo --provider ollama
```

## Next best step
- Feature: Stage 2 — `npx aiready init`
- Start from: design the init command in a TASK.md sprint contract
- Pass when: `npx aiready init --target <bare-repo>` generates missing harness artifacts using actual code as context

## Must not change
- `src/utils/llm.ts` is the ONLY file that may import `@anthropic-ai/sdk` or `openai`
- `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key
- `listOpenAIModels()` is the only place that calls `client.models.list()`
- `AuditConfig.modelId` is a raw string — tier routing lives inside provider `chat()` methods, not in `AuditConfig`
- The 5 subsystem names are fixed across all stages
- `dotenv/config` must remain the absolute first import in `src/cli.ts`

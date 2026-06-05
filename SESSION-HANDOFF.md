# SESSION-HANDOFF.md

## Date
2026-06-05

## What was completed
- **feat-007 complete** — Provider abstraction with interactive selection and dotenv

### New files
- `src/utils/llm.ts` — `LLMProvider` interface + `AnthropicProvider` + `OpenAIProvider` + `OllamaProvider` + `createProvider()` factory. This is the ONLY file that imports `@anthropic-ai/sdk` or `openai`.
- `src/utils/prompt.ts` — `selectAuditConfig()`: shows interactive provider/model selection via `@inquirer/prompts` if flags are omitted; checks env var for chosen provider; exits 1 with ERROR/WHY/FIX + provider URL + Ollama suggestion if key missing.
- `.env.example` — template for ANTHROPIC_API_KEY, OPENAI_API_KEY, OLLAMA_HOST, OLLAMA_MODEL, OPENAI_BASE_URL
- `tests/llm.test.ts` — 15 tests: model selection, prompt caching, response parsing, createProvider factory
- `tests/prompt.test.ts` — 10 tests: flag passthrough, API key gate per provider, Ollama no-key, interactive prompts

### Modified files
- `src/audit/mapper.ts` — removed `@anthropic-ai/sdk` import; accepts `LLMProvider` instead of `apiKey: string`; calls `provider.chat(..., { fast: true })`
- `src/audit/scorer.ts` — same pattern; calls `provider.chat(..., { fast: false })`
- `src/audit/index.ts` — calls `selectAuditConfig()` then `createProvider()`; removed old ANTHROPIC_API_KEY guard
- `src/cli.ts` — added `import 'dotenv/config'` as first line; added `--provider` and `--model` flags
- `.gitignore` — added `.env`
- `tests/mapper.test.ts` — replaced SDK mock pattern with mock `LLMProvider`
- `tests/scorer.test.ts` — same
- `tests/integration.test.ts` — dropped SDK mock; uses mock `LLMProvider`; added OPENAI key guard test and `audit --help` flag test

### New dependencies
- `dotenv` — `.env` file loading at CLI startup
- `@inquirer/prompts` — interactive `select()` for provider/model choice
- `openai` — used by both OpenAIProvider and OllamaProvider (OpenAI-compatible)

## Verification run
| Command | Result |
|---|---|
| `npm run build` | pass — dist/cli.js 25.73 KB, zero errors |
| `npm test` | pass — 112/112 (9 test files) |
| `npm run typecheck` | pass — zero errors |
| `npm run lint` | pass — clean |
| `node dist/cli.js --version` | 0.1.0 |
| `node dist/cli.js audit --provider anthropic --model fast` (no key) | exit 1, ERROR/WHY/FIX with console.anthropic.com URL |
| `node dist/cli.js audit --help` | shows --provider and --model flags |

## What is broken or unverified
- Real LLM calls still not tested in automated suite (all mocked)
- Interactive prompts not tested end-to-end (inquirer mocked in tests)
- Ollama provider not tested against a live Ollama instance

## Manual smoke test (requires .env or exported key)
```bash
# Anthropic — skips prompts
node dist/cli.js audit --target examples/good-repo --provider anthropic --model fast

# OpenAI — skips prompts
node dist/cli.js audit --target examples/good-repo --provider openai --model fast

# Interactive — shows prompts
node dist/cli.js audit --target examples/misnamed-repo

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
- The 5 subsystem names are fixed across all stages
- `dotenv/config` must remain the absolute first import in `src/cli.ts`

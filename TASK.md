# TASK.md — feat-007: Provider abstraction, interactive selection, dotenv

## Feature
feat-007 — Add LLMProvider abstraction so aiready audit works with Anthropic, OpenAI, or Ollama.

## Scope
New files:
- src/utils/llm.ts         — LLMProvider interface + AnthropicProvider + OpenAIProvider + OllamaProvider
- src/utils/prompt.ts      — interactive provider/model selection + API key gate
- .env.example
- tests/llm.test.ts
- tests/prompt.test.ts

Modified files:
- src/audit/mapper.ts      — swap apiKey: string for provider: LLMProvider
- src/audit/scorer.ts      — swap apiKey: string for provider: LLMProvider
- src/audit/index.ts       — wire selectAuditConfig + createProvider, remove old key guard
- src/cli.ts               — add dotenv/config import, --provider and --model flags
- tests/mapper.test.ts     — replace mockCreate pattern with mock LLMProvider
- tests/scorer.test.ts     — same
- tests/integration.test.ts — same
- package.json             — add dotenv, @inquirer/prompts, openai

## Out of scope
- No changes to loader.ts, reporter.ts, cross-ref.ts, fs.ts
- No Stage 2 work

## Pass criteria
- npm run build: zero errors
- npm run typecheck: zero errors
- npm run lint: clean
- npm test: all tests pass (86+ tests)
- node dist/cli.js audit without key → exits 1 with ERROR/WHY/FIX
- node dist/cli.js audit --provider anthropic --model fast (with key set) → skips prompts
- node dist/cli.js audit --provider ollama → runs without API key

## Implementation order
1. Install deps
2. .env.example + .gitignore
3. src/utils/llm.ts
4. src/utils/prompt.ts
5. Update mapper.ts + scorer.ts signatures
6. Update index.ts
7. Update cli.ts
8. Update tests (mapper, scorer, integration)
9. New tests (llm.test.ts, prompt.test.ts)
10. Verify

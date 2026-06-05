# DECISIONS.md — AIReady

Record of key design decisions. Agents read this before making architectural choices.
Append new decisions at the bottom — never edit existing ones.

---

### 2026-06-04: Output AGENTS.md only, not agent-specific files

- **Decision**: Generate a single `AGENTS.md` as the harness entry point, not `CLAUDE.md`, `.windsurfrules`, `.cursor/rules/`, or other agent-specific files
- **Reason**: `AGENTS.md` is the emerging cross-agent standard. Claude Code, Codex, and Windsurf all read it. Cursor users can add a one-line shim pointing to it.
- **Rejected alternatives**: Canonical `.aiready/` layer with per-agent adapter files — correct long-term but premature for MVP. Adds sync complexity with no current user need.
- **Constraints introduced**: All harness content must fit in one file under ~150 lines. Module detail goes in `.aiready/modules/` and is referenced by link.
- **Revisit when**: A real user reports their agent does not read `AGENTS.md`, or a team with mixed agents requests per-agent output.

---

### 2026-06-04: Score harness subsystems, not filename presence

- **Decision**: Stage 1 audit scores content quality across 5 subsystems, not whether specific filenames exist
- **Reason**: An empty `AGENTS.md` passes a filename check but fails an agent. A well-written `agent-guide.md` fails a filename check but works perfectly. Filename detection penalises legitimate variation and rewards empty files.
- **Rejected alternatives**: Exact filename matching (harness-creator approach) — fast to implement but produces misleading scores
- **Constraints introduced**: Scoring must use content heuristics — word counts, regex patterns, section detection — not `fs.exists()` checks
- **Revisit when**: Content heuristics produce too many false positives in practice

---

### 2026-06-04: Stage 1 is fully LLM-free

- **Decision**: The audit command makes no API calls, no network requests, and requires no API key
- **Reason**: Audit must be runnable in CI, free, fast, and trustworthy. LLM-based scoring introduces cost, latency, non-determinism, and a dependency that breaks offline use.
- **Rejected alternatives**: LLM-assisted scoring from day one — better at detecting semantic quality but wrong for an MVP that needs to run anywhere
- **Constraints introduced**: `src/audit/` must never import an LLM SDK. All scoring is regex, heuristics, and structural parsing.
- **Revisit when**: Stage 3 (analyze) — semantic gap detection is explicitly LLM-assisted

---

### 2026-06-04: Cross-reference docs against actual project files

- **Decision**: Stage 1 validates that commands mentioned in `AGENTS.md` exist in `package.json` scripts, and that modules in `ARCHITECTURE.md` match actual `src/` directories
- **Reason**: A stale `AGENTS.md` that references non-existent commands is worse than no `AGENTS.md` — it actively misleads agents. This check is AIReady's key differentiator from harness-creator, which only checks structural presence.
- **Rejected alternatives**: Trust that docs are accurate — produces false confidence in the score
- **Constraints introduced**: `cross-ref.ts` must read both harness docs and project config files. Score should reflect cross-reference failures prominently.
- **Revisit when**: Cross-reference produces too many false positives on non-standard project structures

---

### 2026-06-04: Node.js + TypeScript, distributed via npx

- **Decision**: Build in Node.js 20+ with TypeScript strict mode, published to npm, run via `npx aiready`
- **Reason**: Target users (Claude Code, Cursor, Codex, Windsurf users) all have Node installed as a prerequisite for their tools. `npx` gives zero-install distribution. Python would require pip/pipx and adds a dependency most frontend/fullstack devs don't have ready.
- **Rejected alternatives**: Python — better AI/ML ecosystem for Stage 3+ but wrong distribution model for a CLI targeting JS/TS developers
- **Constraints introduced**: Stage 1 must work with Node built-ins + Commander only. No heavy dependencies.
- **Revisit when**: Stage 3+ needs heavy LLM/embedding work — may introduce a Python subprocess or switch to the Anthropic TypeScript SDK

---

### 2026-06-04: 5 subsystems — identity, verification, state, memory, constraints

- **Decision**: Score against these 5 subsystems, not the theoretical course model (instructions, tools, environment, state, feedback) or harness-creator's model (instructions, state, verification, scope, lifecycle)
- **Reason**: Our subsystems map to what is actually detectable from repo files and what agents actually need. `identity` and `constraints` are gaps in harness-creator. `tools` and `environment` are hard to score without running the project.
- **Rejected alternatives**: Copy harness-creator's subsystem names — misses constraints scoring entirely
- **Constraints introduced**: Subsystem names are fixed across all stages. Future stages (analyze, drift) must use the same 5 names for consistency.
- **Revisit when**: User research reveals a missing subsystem that significantly affects agent reliability

---

### 2026-06-05: Rebuild audit as LLM-powered harness scanner

- **Decision**: Replace Stage 1's deterministic heuristic scoring with a two-step LLM pipeline: (1) a Haiku classification call that maps each markdown file to one or more harness subsystems regardless of filename, (2) a Sonnet scoring call that evaluates content quality per subsystem given the mapped files
- **Reason**: Deterministic regex/heuristic scoring penalises repos with non-standard filenames (CLAUDE.md instead of AGENTS.md, TODO.md instead of PROGRESS.md) and rewards empty files that happen to have the right name. LLM classification correctly handles naming variation; LLM quality scoring produces richer gaps with actionable text.
- **Rejected alternatives**: Keep deterministic scoring and add filename aliases — fixes the naming problem but not the quality problem. A single combined LLM call — simpler but conflates cheap classification with expensive quality scoring.
- **Constraints introduced**: `ANTHROPIC_API_KEY` must be set in the environment before running `aiready audit`. If missing, the CLI exits with a structured error. Tests must mock `@anthropic-ai/sdk` to run without a real API key.
- **Revisit when**: LLM latency or cost becomes a problem at scale; consider caching scored results keyed on file content hashes.

---

### 2026-06-05: Add @anthropic-ai/sdk as a production dependency

- **Decision**: Add `@anthropic-ai/sdk` to `dependencies` (not `devDependencies`) to power the LLM-based mapper and scorer in the audit pipeline
- **Reason**: The SDK is required at runtime by `aiready audit`, not just during development or testing. Putting it in `devDependencies` would cause `npx aiready` to fail for end users.
- **Rejected alternatives**: Using raw `fetch` against the Anthropic API — avoids the dependency but loses typed responses, retry logic, and prompt caching helpers that the SDK provides.
- **Constraints introduced**: The SDK must not be imported anywhere in Stage 1 code paths that existed before this decision (cross-ref.ts, loader.ts — these remain LLM-free). Only mapper.ts and scorer.ts import the SDK.
- **Revisit when**: A lighter-weight alternative to the full SDK is available, or when the project moves to ESM and needs to re-evaluate bundling.

---

### 2026-06-05: LLM calls routed through user's own API keys

- Decision: AIReady makes its own LLM calls using keys from .env
- Reason: No stable programmatic interface exists to piggyback on Claude Code, Cursor, or other agent sessions
- Constraints introduced: users need their own API key to use Stage 1+
- Future option: MCP server mode where Claude Code invokes AIReady as a tool and does the LLM reasoning itself — no API key needed

---

### 2026-06-05: Provider abstraction — LLMProvider interface in src/utils/llm.ts

- **Decision**: Introduce a thin `LLMProvider` interface (`chat(system, user, opts?) → Promise<string>`) that decouples mapper.ts and scorer.ts from any specific SDK. Ship three implementations: `AnthropicProvider`, `OpenAIProvider`, `OllamaProvider`. Expose `--provider` and `--model` CLI flags; show interactive selection via `@inquirer/prompts` when flags are omitted.
- **Reason**: The prompts in mapper.ts and scorer.ts are provider-agnostic text. The only Anthropic-specific coupling was the SDK import and model IDs. Abstracting behind one interface lets users choose Anthropic, OpenAI, Groq (via `OPENAI_BASE_URL`), or Ollama with no code changes. Prompt caching is preserved for Anthropic; OpenAI-compatible endpoints (including Ollama) route through the `openai` package.
- **Rejected alternatives**: A plugin system with dynamically loaded provider packages — correct for an ecosystem but excessive overhead for three first-class providers.
- **Constraints introduced**: `llm.ts` is the ONLY file that imports `@anthropic-ai/sdk` or `openai`. `mapper.ts` and `scorer.ts` must accept `LLMProvider`, never a raw API key. New providers must implement `LLMProvider` fully before being passed to `createProvider`.
- **Revisit when**: A user requests a provider not covered by the OpenAI-compatible adapter pattern (e.g., Google Gemini native API, Mistral native API).
- Revisit when: Claude Code publishes a stable subprocess API, or when MCP adoption is broad enough to justify building a parallel MCP interface
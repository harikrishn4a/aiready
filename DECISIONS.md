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
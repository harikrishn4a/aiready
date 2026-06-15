# aiready

**Audit any repository for AI-agent readiness, then generate the harness that makes coding agents effective.**

`aiready` scores how well a repo is set up for AI coding agents across five subsystems — identity, verification, state, memory, and constraints — using intent-based LLM scoring ("can an agent actually do its job with only what's documented here?"). Then it generates the missing harness artifacts, customised to your stack.

Its content and structure are based on the lessons in [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering).

## Why

A good harness pays for itself every session:

- **Less setup churn** — agents orient in seconds instead of re-discovering the project each time.
- **Fewer integration errors** — a single documented verify command and explicit MUST/MUST NOT constraints stop agents from running commands that don't exist or breaking rules they couldn't have known.
- **Context that survives** — `PROGRESS.md`, `SESSION-HANDOFF.md`, and an architecture map keep state across **sessions, teammates, and different agents**.
- **One source of truth for every agent** — Claude Code, Cursor, Codex, and Windsurf all read the same harness (their entry files become thin shims pointing at it).

## Quick start

```bash
npm install -g @sicilianwildcat/aiready    # or: pnpm add -g / yarn global add

aiready audit              # score the repo, write a remediation plan
aiready init               # generate the missing harness artifacts
```

Bring your own model — Anthropic, OpenAI, or a local Ollama:

```bash
export ANTHROPIC_API_KEY=...        # or OPENAI_API_KEY
aiready audit --provider anthropic --model claude-sonnet-4-6
```

`audit` writes a plan to `plan/plan.md`. `init` writes canonical docs under `docs/`, keeps entry points (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`) and build files at the root, and prints a before→after score with each remaining gap triaged into **you fix it**, **a later stage fixes it**, or **done**.

<sub>**In development** — not yet available:</sub>
> <sub>`aiready analyze` · reads your code + graph to document undocumented intent</sub>
> <sub>`aiready drift` · finds harness docs that have gone stale vs git history</sub>
> <sub>`aiready fix` · patches exactly what's wrong, with a diff before writing</sub>

## How it works

```
audit → plan/plan.md → init → docs/ + root entry points + Makefile/scripts
```

- **Discovery is content-based**, not name-based — it finds your real sources (`requirements.txt`, `FEATURE_PLAN.md`, CI configs, Dockerfile) by what they contain.
- **Nothing is overwritten** without `--force`, and source files are never modified — `init` extracts from them and suggests (never performs) cleanup.
- **Scores are LLM judgements**, so they vary slightly between runs and models — use them as direction, not a fixed metric.

## License

MIT

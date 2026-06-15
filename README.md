# aiready

**Audit any repository for AI-agent readiness, then generate the harness that makes coding agents effective.**

`aiready` scores how well a repo is set up for AI coding agents across five subsystems — **identity, verification, state, memory, and constraints** — using intent-based LLM scoring ("can an agent actually do its job with only what's documented here?"). It then generates the missing harness artifacts, customised to your stack. Whether you're starting fresh or working in a messy, half-documented project, aiready gives you a first draft of the harness suited to your build — for you to review and refine along the way.

Its content and structure are based on the lessons in [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering).

## Why

A good harness pays for itself every session:

- **Less setup churn** — agents orient in seconds instead of re-discovering the project each time.
- **Fewer integration errors** — a single documented verify command and explicit MUST/MUST NOT constraints stop agents from running commands that don't exist or breaking rules they couldn't have known.
- **Context that survives** — `PROGRESS.md`, `SESSION-HANDOFF.md`, and an architecture map keep state across **sessions, teammates, and different agents**.
- **One source of truth for every agent** — Claude Code, Cursor, Codex, and Windsurf all read the same harness; their entry files become thin shims pointing at it.

## Quick start

**1. Install**

```bash
npm install -g @sicilianwildcat/aiready
```

**2. Add an API key** (skip if your repo already has one). Copy this into your `.env` and fill in either key:

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

**3. Build the repo graph** — aiready uses [graphify](https://graphify.net) to map your codebase. `aiready graph` installs graphify automatically if it's missing.

```bash
aiready graph
```

> Code is analysed locally; docs/PDFs/images use the API key from your `.env`. Recommended models: Claude Sonnet/Opus or GPT‑5.5.

**4. Audit** — score the repo and write a gap analysis to `plan/plan.md`.

```bash
aiready audit
```

**5. Initialise artifacts** — generate the harness from the context already in your repo.

```bash
aiready init
```

- Generates canonical artifacts tailored to your stack from the source files aiready identifies.
- If entry-point files already exist (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`), `init` consolidates their content into `AGENTS.md` and points the others at it.
- `init` reorganises the context found in your repo into a clean first draft — it does **not** deep-dive the code to write module-level docs. That semantic code exploration is deferred to the `analyze` stage (in development).

A score of **70–80 after `init` is the healthy target** for this stage: `init` is reorganising context from identified source files, not reading the code. The remaining points come from the `analyze` stage, which will strengthen the harness with a semantic understanding of the code.

> Scores are LLM judgements, not fixed metrics. Calls are stabilised for reliability, but a **±5 swing between runs is expected and normal**.

`audit` writes the plan to `plan/plan.md`. `init` writes canonical docs under `docs/`, keeps entry points and build files (`Makefile`, `scripts/`) at the root, and prints a before→after score with each remaining gap triaged into **you fix it**, **a later stage fixes it**, or **done**.

<sub>**In development** — not yet available:</sub>
> <sub>`aiready analyze` · reads your code + graph to document undocumented intent</sub>
> <sub>`aiready drift` · finds harness docs that have gone stale vs git history</sub>
> <sub>`aiready fix` · patches exactly what's wrong, with a diff before writing</sub>

## How it works

```
                      ┌─────────────────────────────────────────┐
   your repo  ──────► │  aiready graph   (wraps graphify)        │ ──► graphify-out/
                      │  builds a local knowledge graph          │     graph.json
                      └─────────────────────────────────────────┘
                                        │  semantic map of code + docs
                                        ▼
                      ┌─────────────────────────────────────────┐
                      │  aiready audit                           │
                      │  1. discover sources (graph + content    │ ──► plan/plan.md
                      │     scan — by what files contain)        │     • 5 subsystem scores
                      │  2. score 5 subsystems with the LLM      │     • gap triage
                      └─────────────────────────────────────────┘
                                        │
                                        ▼
                      ┌─────────────────────────────────────────┐
   AGENTS.md  ◄────── │  aiready init                            │ ──► docs/
   (root, + shims for │  generate canonical harness artifacts    │     PROGRESS · SESSION-HANDOFF
    CLAUDE/cursor/…)  │  from the discovered sources             │     ARCHITECTURE · CONSTRAINTS
   Makefile, scripts ◄┤  + before→after score & gap triage       │     features · structure · …
                      └─────────────────────────────────────────┘

   subsystems scored:  identity · verification · state · memory · constraints
```

### How the graph powers the audit

graphify turns your repo — code, schemas, docs — into a queryable **knowledge graph**, all locally (your code never leaves your machine). aiready uses that graph to **discover which files are relevant to each harness subsystem** and rank them, so the scorer reads the *right* sources (your real `requirements.txt`, `FEATURE_PLAN.md`, CI config, architecture notes) rather than guessing from filenames. It's combined with a content-based scan, so:

- **With a graph** — richer, semantically-ranked source discovery.
- **Without one** — aiready still works, falling back to a content scan of your markdown and config files.

That's why `aiready graph` is step 3: a better map means a more accurate score and a better-targeted harness.

### Principles

- **Discovery is content-based**, not name-based — it finds your real sources by what they contain.
- **Nothing is overwritten** without `--force`, and source files are never modified — `init` extracts from them and *suggests* (never performs) cleanup.
- **Scores are LLM judgements**, so they vary slightly between runs and models — use them as direction, not a fixed metric.

## License

MIT

# aiready

**Audit any repository for AI-agent readiness, then generate the harness that makes coding agents effective.**

`aiready` scores how well a repo is set up for AI coding agents across five subsystems — identity, verification, state, memory, and constraints — using intent-based LLM scoring ("can an agent actually do its job with only what's documented here?"). Then it generates the missing harness artifacts (markdown files and docs), customised to your stack. Whether you are starting a new project, or in the middle of a messy project, aiready is meant to give a first draft of the harness artifacts suited to your build, for you to review and modify along the way.

Its content and structure are based on the lessons in [walkinglabs/learn-harness-engineering](https://github.com/walkinglabs/learn-harness-engineering).

## Why

A good harness pays for itself every session:

- **Less setup churn** — agents orient in seconds instead of re-discovering the project each time.
- **Fewer integration errors** — a single documented verify command and explicit MUST/MUST NOT constraints stop agents from running commands that don't exist or breaking rules they couldn't have known.
- **Context that survives** — `PROGRESS.md`, `SESSION-HANDOFF.md`, and an architecture map keep state across **sessions, teammates, and different agents**.
- **One source of truth for every agent** — Claude Code, Cursor, Codex, and Windsurf all read the same harness (their entry files become thin shims pointing at it).

## Quick start

Step 1:
```bash
npm install -g @sicilianwildcat/aiready
```

Already installed? See [Updating](#updating) to pull the latest release.

Step 2: Add an api key for either OpenAI / Anthropic if absent in your repo.

Copy this to your .env, and fill in the api keys.

```bash
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

Step 3: Generate repo graph
- choose the model of your preferance (recommended: Claude Sonnet / Opus / GPT 5.5)
- aiready leverages graphify to generate this graph.

```bash
aiready graph
```

Step 4: Audit the repo
- aiready scores the repo and generates gap analysis in plan/plan.md
```bash
aiready audit              
```

Step 5: Initialise artifacts
- aiready generates custom artifacts to strengthen your harness based on docs available in your repo
- if existing entry point files (AGENTS.md / CLAUDE.md / cursor / windurf) are present, init reorganises content from these files to AGENTS.md, and points other entry files to AGENTS.md
- init is meant to create template artifacts based on the content and context available in your repo, doesn't do a deep dive into the code base to generate module level docs, that is deferred to analyze stage, which is currently under development.

```bash 
aiready init        
```
- A score of 70 - 80 is considered ideal for this stage, for it to be considered a well crafted harness as init merely reorganises and improves on existing context found in artifacts from identified source files. The actual code exploration is deffered to analyse stage which is currently underdevelopment, to ensure that the harness can be strengthened with semantic understanding of code.  
- LLM calls are not deterministic, but are stabilised to provide reliable scoring. A +- 5 between calls is expected, and normal.


`audit` writes a plan to `plan/plan.md`. `init` writes canonical docs under `docs/`, keeps entry points (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, `.windsurfrules`) and build files at the root, and prints a before→after score with each remaining gap triaged into **you fix it**, **a later stage fixes it**, or **done**.

<sub>**In development** — not yet available:</sub>
> <sub>`aiready analyze` · reads your code + graph to document undocumented intent</sub>

> <sub>`aiready drift` · finds harness docs that have gone stale vs git history</sub>

> <sub>`aiready fix` · patches exactly what's wrong, with a diff before writing</sub>

## Updating

After a new release, update your global install:

```bash
npm install -g @sicilianwildcat/aiready@latest
```

Or:

```bash
npm update -g @sicilianwildcat/aiready
```

Check what's installed:

```bash
aiready --version
npm list -g @sicilianwildcat/aiready
```

aiready also prints an update notice when a newer version is available on npm.

## How it works

```
audit → plan/plan.md → init → docs/ + root entry points + Makefile/scripts
```

- **Discovery is content-based**, not name-based — it finds your real sources (`requirements.txt`, `FEATURE_PLAN.md`, CI configs, Dockerfile) by what they contain.
- **Nothing is overwritten** without `--force`, and source files are never modified — `init` extracts from them and suggests (never performs) cleanup.
- **Scores are LLM judgements**, so they vary slightly between runs and models — use them as direction, not a fixed metric.

## Telemetry

aiready collects anonymous usage data (command run, OS, duration, success or failure) to help improve the tool.

**To opt out**, set this before running any command:

```bash
export CLI_OPEN_TELEMETRY_DISABLE=1
```

Add that to your shell profile if you want it permanent.

## License

MIT

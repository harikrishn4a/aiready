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

---

### 2026-06-05: Dynamic OpenAI model list + versioned Anthropic model list

- **Decision**: OpenAI models are fetched live from `GET /v1/models` (filtered to `gpt-*`, sorted newest-first, with a static fallback on failure); Anthropic models are maintained as a versioned hardcoded list in `src/utils/models.ts`.
- **Reason**: OpenAI publishes a public `/models` endpoint and releases new models frequently — dynamic fetch keeps the list current without code changes. Anthropic has no public model discovery endpoint; a curated list in one file is the least-friction maintenance approach.
- **Rejected alternatives**: Hardcode both providers — stale OpenAI list on every new model release. Fetch both dynamically — Anthropic has no equivalent endpoint.
- **Constraints introduced**: `listOpenAIModels()` lives in `llm.ts` (the SDK boundary file) and is the only place that calls `client.models.list()`. `models.ts` exports `ANTHROPIC_MODELS` and `OPENAI_FALLBACK_MODELS`; model ID updates require editing only that file. `AuditConfig.modelId` is now a raw string (the chosen model ID), not a tier enum — the tier-routing logic lives entirely inside each provider's `chat()` method.
- **Revisit when**: Anthropic adds a public model discovery endpoint, or the fallback model list becomes noticeably stale.

---

### 2026-06-05: Two-stage mapper triage to reduce token usage

- **Decision**: Split `mapFiles()` into two fast-model calls — triage (all file names + 5-line previews) then classification (50-line previews of triaged files only). Log cumulative estimated tokens at end of audit via `LLMProvider.getTotalTokens()`.
- **Reason**: Large repos exceeded TPM limits when all file previews were sent in one batched mapper call. Triage cheaply filters harness-relevant files before the heavier classification step. Full content still flows to scorer for mapped files only.
- **Rejected alternatives**: tiktoken for exact counts — adds dependency and bundle size for logging-only use. Single-call with smaller previews only — loses classification accuracy on structure-heavy docs.
- **Constraints introduced**: `estimateTokens()` lives in `tokens.ts` (chars/4 heuristic). Token counter is session-scoped per provider instance. JSON audit output includes `token_usage` field.
- **Revisit when**: Provider APIs expose exact usage metadata worth switching from estimates, or triage accuracy proves insufficient on real repos.

---

### 2026-06-05: Graphify integration, filename-only triage, mapped-file cross-reference

- **Decision**: (1) When `graphify-out/graph.json` or a dated subdirectory (`graphify-out/YYYY-MM-DD/graph.json`) exists in the target repo, use the Graphify knowledge graph to rank markdown files by degree centrality and skip triage entirely — the top 10 files go straight to classification. (2) When no Graphify output exists, the triage call now sends filenames only (no content previews) rather than 5-line previews — a ~10× token reduction on the triage step. (3) `crossRef()` now accepts `FileMapping[]` and falls back to mapped identity/verification files (for command checks) and mapped memory files (for module checks) when no canonical `AGENTS.md` / `ARCHITECTURE.md` was found by the loader — eliminating false "No AGENTS.md" failures when `CLAUDE.md` or a custom file was correctly mapped.
- **Reason**: TPM pressure on large repos; filename-only triage is sufficient for the binary relevant/not-relevant decision. Graphify users already have centrality rankings — reusing them saves two LLM calls entirely. Hardcoded-filename cross-ref was the last place that penalised non-standard repo layouts.
- **Rejected alternatives**: Keep 5-line previews for triage — marginally more context but 5-10× more tokens for a filter step. Read graph node labels for filenames — source_file is more reliable than label.
- **Constraints introduced**: `loadRepo()` is still synchronous (uses `readFileSync` / `existsSync`). Graphify path checked at load time — no hot-reload. `mapFiles()` third param `usedGraphify` defaults to `false` so all existing callers remain compatible. `crossRef()` second param `mappings` defaults to `[]`.
- **Revisit when**: Graphify schema changes (different node fields), or if degree centrality proves a poor proxy for harness relevance on a real corpus.

---

### 2026-06-05: Audit emits a durable remediation contract for init

- **Decision**: Stage 1 audit now writes `.aiready/plan.md` and includes the same remediation contract in JSON. The contract has `generate`, `improve`, and `review_manually` sections, references the `examples/` templates, and sets `max_lines: 300` for generated or improved artifacts. CLI output stays short.
- **Reason**: Stage 2 `init` should consume a stable audit contract rather than re-deriving gaps from terminal text. Humans also need a durable markdown plan they can review, diff, and keep across sessions. The 300-line cap protects agent readability and prevents generated harness files from becoming context-dense dumps.
- **Rejected alternatives**: Terminal-only remediation output — easy to lose and hard for `init` to consume. Auto-cleaning messy files — too risky; audit should suggest manual review only. Centrality-based Graphify selection — harness files often have low centrality because few files reference them.
- **Constraints introduced**: Graphify selection uses semantic node-label concept matching plus guaranteed root harness filenames. Spinner output is TTY-only and disabled for JSON/CI. Stage 1 may write `.aiready/plan.md`, but it must not generate or overwrite canonical harness files.
- **Revisit when**: Stage 2 `init` is implemented and needs additional fields in the remediation contract.

---

### 2026-06-05: Audit output and plan contract are simplified

- **Decision**: Rename remediation `review_manually` to `source_context`, render `.aiready/plan.md` as Missing Artifacts / Weak Artifacts / Source Context To Review, render terminal subsystem scores as multi-line blocks, and make `--min-score` an explicit CI opt-in instead of a default failure threshold.
- **Reason**: `source_context` is clearer than "manual review": those files are inputs for generation, not cleanup instructions. Multi-line terminal output avoids confusing line wraps on long notes. Defaulting audit to exit 0 keeps exploratory runs from looking like CLI failures while preserving CI gating through `--min-score`.
- **Rejected alternatives**: Keep the default score threshold at 70 — useful for CI but surprising for local discovery. Keep one-line bar output — compact but hard to scan once explanations wrap.
- **Constraints introduced**: Normal audit runs should not call `process.exit(1)` solely because the score is low. Future `init` code should treat `source_context` as read-only input and must not delete, rename, or overwrite those files automatically.
- **Revisit when**: Stage 2 `init` consumes `.aiready/plan.md` and needs additional machine-readable fields.

---

### 2026-06-05: Constraints can be recognized as sections

- **Decision**: The mapper now adds a constraints subsystem mapping when full file content contains hard constraint language such as `MUST NOT`, even if the LLM classifier did not map that file to constraints. The scorer prompt treats constraints as a file or section, not only as a dedicated `CONSTRAINTS.md`.
- **Reason**: A repo can have real constraints inside `CLAUDE.md`, `AGENTS.md`, or another agent entry point. That should score as weak or partially structured constraints, not as missing constraints.
- **Rejected alternatives**: Require a dedicated `CONSTRAINTS.md` before giving any score — too brittle and contradicts content-aware auditing. Trust the LLM classifier alone — it can miss late-file sections because classification uses previews.
- **Constraints introduced**: Dedicated constraints structure can still score higher, but hard constraints embedded in another harness file must not produce a missing-file remediation item.
- **Revisit when**: The mapper gains chunked classification or section-level extraction.

---

### 2026-06-05: All subsystems can be recognized as misplaced sections

- **Decision**: The mapper now applies deterministic full-content signal detection for identity, verification, state, memory, and constraints after LLM mapping. The scorer prompt tells the model to score subsystem content found in the wrong file or section and warn that it should be structured into the expected artifact.
- **Reason**: Stage 1 should audit what is actually present, not only what is present in ideal filenames. Misplaced subsystem content should become an `improve` recommendation, not a false `generate` recommendation.
- **Rejected alternatives**: Keep deterministic fallback only for constraints — that leaves the same false-missing bug for verification commands, progress notes, architecture notes, and identity content. Depend only on preview-based LLM mapping — later sections can be missed.
- **Constraints introduced**: Signal detection should stay conservative and should not make generic docs score highly. Quality and structure remain the scorer's job.
- **Revisit when**: The mapper supports section-level extraction with source spans.

---

### 2026-06-05: Audit plan source files must be useful and deduped

- **Decision**: `.aiready/plan.md` now deduplicates SOURCE CONTEXT by file path, combines mapped subsystems on one entry, and selects `source_files` for GENERATE/IMPROVE from non-empty candidate files. Empty canonical stubs are not used as their own source context.
- **Reason**: Stage 2 init needs useful source material, not empty target files. When a repo has empty canonical artifacts plus meaningful non-canonical context, the audit plan should point init at the meaningful files.
- **Rejected alternatives**: Keep every `(path, subsystem)` as a separate SOURCE CONTEXT entry — readable for machines but noisy for humans and redundant for init. Always include canonical target files as sources — misleading when the target file is an empty stub.
- **Constraints introduced**: `remediation.ts` may read candidate files only to determine whether they contain useful content; it still must not generate or modify harness artifacts beyond writing `.aiready/plan.md`.
- **Revisit when**: Init executor switches empty improve targets to generation mode.

---

### 2026-06-05: Add ora for init spinner

- **Decision**: Add `ora@5` (v5.4.1) as a runtime dependency for TTY spinner in the `init` executor.
- **Reason**: LLM calls during init take 5–30 seconds per artifact. Without a spinner, the terminal appears frozen. `ora` is the standard Node.js spinner library. Version 5 is used because it supports both CJS and ESM — `ora@8` is ESM-only and cannot be `require()`'d by tsup's CJS output bundle.
- **Rejected alternatives**: Reuse `src/utils/spinner.ts` — that file's `withSpinner` is a single shared spinner; init needs per-artifact spinners with text updates mid-call. Roll a custom spinner — not worth the maintenance. Use `ora@8` — fails at runtime with `ERR_REQUIRE_ESM` from the CJS bundle.
- **Constraints introduced**: Pinned to `ora@5`. Upgrading to ora@6+ will break the CJS bundle unless tsup is switched to ESM or ora is marked external.
- **Revisit when**: The CLI is migrated to pure ESM output (tsup format: ['esm']) — then ora@8+ can be used directly.

---

### 2026-06-05: Init executes plan.md and uses Graphify for context

- **Decision**: Stage 2 `planner.ts` parses GENERATE/IMPROVE/SKIP from `.aiready/plan.md` only — no independent canonical artifact decisions. `executor.ts` strips LLM markdown fences before write and routes empty improve targets through the generate path. When `graphify-out/graph.json` exists, init always injects subsystem-ranked graphify context into generate/improve prompts; it expands `source_files` only when plan sources are thin (<500 chars), using SOURCE CONTEXT paths and graphify-ranked markdown files.
- **Reason**: Audit is the single decision-maker; init was re-deciding 12 generates when plan said GENERATE (none). betterworld repos have rich context in `change_logs/` and `plan.md` indexed by Graphify but not always listed in IMPROVE `source_files`. CLAUDE.md may exist on disk but not appear in graph nodes.
- **Rejected alternatives**: Planner keeps subsystem-score thresholds — contradicts audit contract. Always replace plan source_files with graphify — overrides audit intent when sources are already rich.
- **Constraints introduced**: Shared graphify ranking lives in `src/utils/graphify.ts` (audit loader + init context). Init must not write to target repos without user confirmation/`--force`.
- **Revisit when**: Graphify schema adds richer edge-based ranking or init needs code (non-markdown) context from graph nodes.
---

### 2026-06-15: Audit scoring is 100% intent-based (no structural checks)

- **Decision**: Score every subsystem with a single LLM call answering one fixed question — "Can an AI coding agent do its job using only what is documented here?" — driven by `SUBSYSTEM_INTENTS`. Remove all structural scoring: `detectFileType`, `scoreMakefile/Shell/Json/Architecture/MarkdownStructure`, `scoreStructural`, `combineScores`, `scoreFromBaseline`, and the 40/60 structural+content weighting. `SubsystemScore` becomes `{ score, gaps, findings, files, baselineStatus? }`.
- **Reason**: Structural checks (heading coverage, required Makefile targets, etc.) rewarded shape over usefulness — a file could have all canonical headings and still be useless to an agent, and a Makefile/JSON/markdown file could each satisfy a subsystem if the content is right. Intent-based scoring measures what actually matters: can the agent act on it.
- **Rejected alternatives**: Keep a small structural floor — reintroduces shape-over-substance bias. Per-file-type rubrics — high maintenance, still proxy metrics.
- **Constraints introduced**: `checkVerificationBaseline` is retained but surfaced as a finding only (not a score input). Scoring quality now depends entirely on the LLM; templates are passed as quality reference, not as requirements.
- **Revisit when**: Scores prove unstable across runs/models and a deterministic anchor is needed.

---

### 2026-06-15: plan/ and docs/ layout; entry points stay at root

- **Decision**: Audit writes its remediation plan to `plan/plan.md` (was `.aiready/plan.md`). Init writes non-entry markdown artifacts under `docs/`; agent entry points (AGENTS.md, CLAUDE.md, .cursorrules, .windsurfrules, .github/copilot-instructions.md) and build artifacts (Makefile, scripts/*, *.json) stay at the repo root. Placement is centralised in `src/utils/layout.ts`.
- **Reason**: Keeps the repo root clean while preserving the files agents and toolchains expect there. `make` needs the Makefile at root; agents look for AGENTS.md/CLAUDE.md at root; everything else is reference documentation that belongs under docs/.
- **Rejected alternatives**: Move everything (including Makefile/AGENTS.md) into docs/ — breaks `make` and agent discovery. Flag-gated layout — the user wants this as the default behavior.
- **Constraints introduced**: The loader must find canonical artifacts at root OR docs/ (so re-audit reflects init output). A legacy root artifact is treated as existing and restructured into docs/ (content preserved); the root copy is left in place and surfaced via noise-cleanup, never auto-deleted.
- **Revisit when**: Users want configurable folder names or auto-removal of root duplicates.

---

### 2026-06-15: Deterministic docs cross-linking (not prompt-only)

- **Decision**: After generating an artifact, deterministically rewrite bare references to docs/-bound artifacts into their docs/ path via `rewriter.linkDocsReferences()` (skips the file's own name, root files, and already-prefixed paths). The LLM prompt also carries a layout note, but the deterministic pass is the source of truth.
- **Reason**: Telling the model where files live worked unreliably on smaller models (gpt-4o-mini left bare `PROGRESS.md` references). Agents must be able to locate artifacts; a regex pass guarantees it. Verified on betterworld: AGENTS.md went from 1 to 16 `docs/` references.
- **Rejected alternatives**: Prompt-only instruction — unreliable. Post-hoc link checking that only warns — leaves broken references in place.
- **Constraints introduced**: docs/-bound artifact names come from `CANONICAL_ARTIFACTS` filtered by `isDocsArtifact`; the regex must not double-prefix or rewrite root files (AGENTS.md, Makefile, *.json).
- **Revisit when**: Artifacts gain references to files outside the canonical set that also move under docs/.

---

### 2026-06-15: Stack-aware generation for Makefile / scripts / startup.md

- **Decision**: The generateOnly artifacts whose content is command-bearing — `Makefile`, `scripts/init.sh`, `scripts/verify.sh`, `startup.md` — are no longer copied verbatim from `examples/`. They are routed through the rewriter with a `detectStack()` summary so commands match the real toolchain (e.g. `pytest`/`ruff`/`uvicorn` on a Python repo). All other generateOnly artifacts (rubrics, schemas, checklists) remain verbatim copies. Makefile recipe lines are tab-repaired post-generation (`fixMakefileTabs`).
- **Reason**: A verbatim template Makefile said `npm test` on a Python project — the documented "single runnable verify command" literally failed, capping the verification subsystem. Verified fix: betterworld's Makefile is now pure Python with zero npm references.
- **Rejected alternatives**: Keep verbatim and let humans edit — defeats "init makes it work". Hard-code per-language Makefiles — brittle; the LLM adapts better given detected facts. Token-substitute commands into the template — fragile across stacks.
- **Constraints introduced**: LLM-generated Makefiles risk space indentation (breaks `make`) → `fixMakefileTabs` is mandatory for the Makefile path. `detectStack` returns facts only, never hard-coded commands.
- **Revisit when**: Stack detection needs more ecosystems, or generated commands prove inaccurate (e.g. wrong dev-server entrypoint) often enough to warrant reading config files directly.

---

### 2026-06-15: Stabilise LLM scoring (temperature 0 + seed + score bands)

- **Decision**: The mapper and scorer LLM calls pass `temperature: 0` and `seed: 7` (seed honoured by OpenAI-compatible providers; Anthropic gets temperature only). The scorer system prompt anchors to explicit 0-100 SCORE BANDS. A non-determinism disclosure is printed in audit and init output.
- **Reason**: Repeated audits of identical content swung widely (84 vs 70 on gpt-4o-mini). Low temperature + a fixed seed + banded rubric tightened this to ~3pt overall on Sonnet. LLM scoring is inherently non-deterministic, so the disclosure sets correct expectations rather than implying a fixed metric.
- **Rejected alternatives**: Average N scoring calls — N× cost for marginal gain. Deterministic structural scoring — already rejected (feat-021). Hide the variance — misleading.
- **Constraints introduced**: `ChatOptions` carries `temperature`/`seed`; scoring/mapping must keep `temperature: 0` for repeatability. Anthropic ignores `seed`, so its scores remain slightly less repeatable than OpenAI's.
- **Revisit when**: A provider adds stronger determinism controls, or score stability still blocks CI gating via `--min-score`.

---

### 2026-06-15: Score content per-file, not per-subsystem-blob

- **Decision**: `scorer.buildSubsystemContent` caps each mapped file at 6000 chars (was: join all files then slice the blob at 3000). Dedicated artifacts are ordered before agent entry files; the per-subsystem join is bounded at 16000.
- **Reason**: After the docs/ split, `AGENTS.md` references every artifact and is mapped into multiple subsystems. The old 3000-char blob cap let a large `AGENTS.md` crowd out the real `docs/CONSTRAINTS.md` etc., so the scorer literally reported "content is not shown — only its existence is referenced" and scored low. Per-file capping + entry-files-last fixed it: betterworld's standalone audit went 49 → 81.
- **Rejected alternatives**: Only raise the blob cap — entry files still dominate ordering. Stop mapping AGENTS.md to multiple subsystems — loses genuinely useful inline content.
- **Constraints introduced**: Total scoring prompt grows with file count; bounded by the 6000/file and 16000/subsystem caps.
- **Revisit when**: Very large repos push the scoring prompt past model context limits.

import { readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import { loadTemplate, assertTemplateLoaded } from './generator.js';
import { cleanLLMOutput } from './output.js';
import { findDriftedHeadings, replaceHeadings } from './corrector.js';
import { artifactOutputPath, isDocsArtifact } from '../utils/layout.js';
import { CANONICAL_ARTIFACTS } from '../audit/remediation.js';
import { detectStack } from '../utils/detect.js';

// generateOnly artifacts whose commands must match the real toolchain. These are
// rewritten with detected-stack context instead of being copied verbatim.
export const STACK_AWARE_FILES = new Set<string>([
  'Makefile',
  'scripts/init.sh',
  'scripts/verify.sh',
  'startup.md',
]);

export function isStackAware(filename: string): boolean {
  return STACK_AWARE_FILES.has(filename);
}

// Canonical artifacts that live under docs/ — their references must be docs-prefixed.
const DOCS_ARTIFACT_NAMES = CANONICAL_ARTIFACTS
  .map((a) => a.filename)
  .filter((f) => isDocsArtifact(f));

/**
 * Deterministically rewrite bare references to docs/-bound artifacts into their
 * docs/ path (e.g. `PROGRESS.md` → `docs/PROGRESS.md`), so an agent reading any
 * artifact can locate the others. Leaves already-prefixed paths and root files
 * (AGENTS.md, Makefile, *.json) untouched.
 */
export function linkDocsReferences(content: string, self?: string): string {
  let out = content;
  for (const name of DOCS_ARTIFACT_NAMES) {
    if (name === self) continue; // don't docs-prefix the file's own self-references
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Preceding char must not be a word char or '/', and trailing must not
    // continue a word or path — so "docs/PROGRESS.md" is never re-matched, while
    // a backtick-quoted `PROGRESS.md` still is.
    const re = new RegExp('(^|[^\\w/])' + esc + '(?![\\w/])', 'g');
    out = out.replace(re, (_m, pre: string) => `${pre}docs/${name}`);
  }
  return out;
}

// Tells the LLM where harness artifacts live so cross-references resolve.
const LAYOUT_NOTE = `REPOSITORY LAYOUT — reference other artifacts by their real path:
- AGENTS.md stays at the repo root (it is the agent entry point).
- Makefile, scripts/, and feature_list.json stay at the repo root.
- ALL other harness markdown files live under docs/ — e.g. docs/PROGRESS.md,
  docs/ARCHITECTURE.md, docs/CONSTRAINTS.md, docs/DECISIONS.md,
  docs/SESSION-HANDOFF.md, docs/structure.md.
When you mention another harness file, use its docs/ path so an agent can find it.`;

const MAX_LINES = 300;

export interface RewriteArtifact {
  filename: string;
  templateFile: string;
  sourceFiles: string[];
  currentContent: string | null;
}

export interface RewriteResult {
  content: string;
  changes: string[];
  extractedFrom: string[];
}

// Base system prompt — common rules for every canonical artifact.
const REWRITE_SYSTEM = `You are creating a canonical harness artifact for an
AI coding agent. The artifact must be immediately useful to an agent.

YOUR JOB:
1. Extract ALL relevant information from the source files provided
2. Restructure that information into the canonical artifact format
3. Fill every section with real, specific content from the sources
4. Where information is missing, write "Not yet documented" — never invent

HEADING RULES:
- Use the EXACT section headings from the template — character for character
- Do not rename, reword, or paraphrase any heading
- Never output {{PLACEHOLDER}} text literally
- Replace {{PLACEHOLDER}} text with real content or "Not yet documented"

CONTENT RULES:
- Be specific: real module names, real commands, real file paths, real versions
- Preserve all specific facts from source files
- Remove duplicate information
- Hard limit: 300 lines maximum

OUTPUT:
- File content only
- No explanation, no markdown code fences
- First line is the # Title or first ## heading`;

// Per-file guidance keyed by canonical filename. Encodes the KEEP / CUSTOMIZE /
// CRITICAL / MODE rules from INIT-COMMAND-PROMPTS.md. Only the non-generateOnly
// artifacts reach the LLM; generateOnly files are pure template copies.
const FILE_GUIDANCE: Record<string, string> = {
  'AGENTS.md': `FILE: AGENTS.md
STRUCTURE (maintain this order, never reorder): What this is, Current stage,
Stack, Repo structure, Session start, Session end, Working rules,
Completion gate, Verification commands, Escalation, Constraints.
FIXED (copy exactly, customize only placeholders): Session start (all steps),
Session end (all steps), Working rules phrasing, Completion gate checkboxes,
Escalation patterns, Constraints reference.
CUSTOMIZE: "What this is" (one paragraph — what the product does, who it's for,
the problem it solves); "Current stage" (format: "Stage X — title. description.");
Stack (real language/runtime, frameworks, database, test runner, build tool);
Repo structure (actual modules with real responsibilities); Verification commands
(real commands that work for this repo, referencing Makefile targets).
CRITICAL: fill ALL placeholders with project-specific content.`,

  'structure.md': `FILE: structure.md
KEEP: intro "How artifacts are organised in this repository"; project structure
code block format; ownership table structure and column headers.
CUSTOMIZE: file tree (actual files in this repo); ownership rows; file
descriptions in project-specific language.`,

  'architecture.md': `FILE: ARCHITECTURE.md
KEEP: section structure (Overview, Module map, Data flow, Key invariants); code
block format for module map and data flow diagrams; explanatory style.
CUSTOMIZE: Overview (one-paragraph summary of layers and data flow); Module map
(real module names with real responsibilities); Data flow (ASCII diagram of the
actual execution flow); Key invariants (architectural rules specific to this code).`,

  'constraints.md': `FILE: CONSTRAINTS.md
KEEP: MUST / MUST NOT language throughout; section structure (Scope,
Verification, Artifacts, Dependencies, etc.); exact phrasing patterns
("MUST work on", "MUST NOT remove").
CUSTOMIZE: fill each MUST / MUST NOT with actual project rules; add real
domain-specific constraint sections.
CRITICAL: do NOT leave placeholder sections like "## {{DOMAIN_SPECIFIC_SECTION}}".
Every section must contain real, project-specific constraints.`,

  'decisions.md': `FILE: DECISIONS.md
KEEP: intro "Record every significant architectural or dependency decision here";
the Template section (YYYY-MM-DD title, Decision, Reason, Rejected alternatives,
Constraints, Revisit when); the Example section structure.
CUSTOMIZE: preserve any existing decisions and restructure them to the template
format; if none yet, keep the template plus one realistic example decision.`,

  'progress.md': `FILE: PROGRESS.md
STRUCTURE (maintain exactly, never reorder): Current State, Completed,
In Progress, Known Issues, Next Steps.
CUSTOMIZE: real commit hash/test count/lint status; actual completed features;
actively in-progress work; real bugs or blockers; concrete next steps.`,

  'session-handoff.md': `FILE: SESSION-HANDOFF.md
STRUCTURE (maintain exactly, never reorder): Date, What was completed,
Verification run (Command | Result table), What is broken or unverified,
Next best step, Must not change.
CUSTOMIZE: real session state, real feature IDs/titles, real verification results.`,

  'Makefile': `FILE: Makefile
KEEP: target names (setup, dev, check, test, lint, clean, build, typecheck, format),
.PHONY declaration, and the comment structure above each target.
CUSTOMIZE: replace the command inside EVERY target with the real command for THIS
project's stack (from DETECTED STACK below). Examples by stack: Python →
setup: pip install -r requirements.txt, test: pytest, lint: ruff check ., dev:
uvicorn app:app --reload; Node → use the package.json scripts; Go → go test ./...
Remove targets that do not apply (e.g. typecheck for a language without a type checker).
CRITICAL: recipe lines MUST be indented with a TAB, never spaces. Do not emit npm
commands for a non-Node project. Output a valid Makefile only — no prose, no fences.`,

  'scripts/init.sh': `FILE: scripts/init.sh
KEEP: shebang (#!/usr/bin/env bash), set -e, and a clear install flow.
CUSTOMIZE: use the real install command for THIS stack (from DETECTED STACK) —
e.g. pip install -r requirements.txt, npm ci, go mod download, cargo fetch.
Output a runnable shell script only — no prose, no markdown fences.`,

  'scripts/verify.sh': `FILE: scripts/verify.sh
KEEP: shebang (#!/usr/bin/env bash), set -e, and a build → typecheck → lint → test flow.
CUSTOMIZE: use the real commands for THIS stack (from DETECTED STACK) — e.g. Python:
ruff check . then pytest; Node: npm run build / typecheck / lint / test. Echo a clear
"All checks passed." at the end. Output a runnable shell script only — no fences.`,

  'features.md': `FILE: features.md
KEEP: the feature-list structure and status conventions from the template.
CUSTOMIZE: derive the actual features from the SOURCE CONTEXT — especially any
FEATURE_PLAN / ROADMAP / PROGRESS doc. List each real feature with a short
description and a status. Use "not started" / "in progress" / "done" honestly;
where status is unknown, mark it "not started" — never invent completion.`,

  'feature_list.json': `FILE: feature_list.json
Output VALID JSON ONLY — no prose, no markdown, no code fences.
KEEP top-level fields exactly: project, last_updated, rules, status_legend, features.
CUSTOMIZE: build the "features" array from the SOURCE CONTEXT (especially
FEATURE_PLAN / ROADMAP). Each feature object: id (feat-001…), priority, area,
title, user_visible_behavior, status, blocked_reason, verification, evidence,
agent_notes, last_updated. Set status to "not_started" where unknown — never
fabricate "passing". Derive area/title from the source; leave evidence [] and
agent_notes "" when unknown.`,

  'startup.md': `FILE: STARTUP.md
KEEP: the "Action | Command" table, and the Start commands / Current state /
Project structure sections.
CUSTOMIZE: commands must reference real Makefile targets or this stack's tools
(from DETECTED STACK), not npm defaults unless this is a Node project. Show the
actual top-level directory layout.`,
};

function guidanceFor(filename: string): string | undefined {
  const base = basename(filename).toLowerCase();
  // Match by case-insensitive basename so AGENTS.md / agents.md both resolve.
  for (const [key, value] of Object.entries(FILE_GUIDANCE)) {
    if (basename(key).toLowerCase() === base) return value;
  }
  return undefined;
}

function buildSystemPrompt(filename: string): string {
  const guidance = guidanceFor(filename);
  return guidance ? `${REWRITE_SYSTEM}\n\n=== FILE-SPECIFIC RULES ===\n${guidance}` : REWRITE_SYSTEM;
}

function buildRewritePrompt(
  filename: string,
  templateContent: string,
  sourceContents: string[],
  currentContent: string | null,
  stackInfo: string | null,
  repoName: string | null,
): string {
  const parts: string[] = [
    `Create ${filename} following this template exactly:`,
    `=== TEMPLATE ===`,
    templateContent,
    `=== END TEMPLATE ===`,
  ];

  if (stackInfo) {
    parts.push(
      `\n=== DETECTED STACK (make every command match this — do NOT emit npm commands for a non-Node project) ===`,
      stackInfo,
      `=== END DETECTED STACK ===`,
      `PATHS: this file lives at the repository ROOT and its commands run from there.`,
      `The project root IS the current directory ("."). Do NOT \`cd\` into a`,
      `subdirectory and do NOT prefix commands, paths, or scripts with the repository's`,
      `own folder name${repoName ? ` ("${repoName}")` : ''} — write \`pytest\`, not \`pytest ${repoName ?? '<repo>'}/\`;`,
      `\`bash dev.sh\`, not \`bash ${repoName ?? '<repo>'}/dev.sh\`; \`./scripts/verify.sh\`, not \`cd ${repoName ?? '<repo>'} && ...\`.`,
    );
  }

  if (currentContent && currentContent.trim().length > 0) {
    parts.push(
      `\nEXISTING CONTENT (extract and restructure this — preserve all specific facts):`,
      `=== EXISTING ===`,
      currentContent.slice(0, 3000),
      `=== END EXISTING ===`,
    );
  }

  if (sourceContents.length > 0) {
    parts.push(`\nSOURCE CONTEXT (extract relevant information from these files):`);
    for (const src of sourceContents) {
      parts.push(src.slice(0, 2000));
    }
  }

  parts.push(`\n${LAYOUT_NOTE}`);
  if (isDocsArtifact(filename)) {
    parts.push(`This file (${filename}) is written to ${artifactOutputPath(filename)}.`);
  }

  parts.push(
    `\nProduce ${filename} under ${MAX_LINES} lines.`,
    `Use exact template headings.`,
    `Fill every section with specific real content.`,
    `Never output {{PLACEHOLDER}} text.`,
  );

  return parts.join('\n');
}

/**
 * Makefiles require TAB-indented recipe lines. LLMs frequently emit spaces, which
 * breaks `make`. Convert leading spaces to a tab on recipe lines (any indented,
 * non-blank line that follows a target line until the next unindented line).
 */
export function fixMakefileTabs(content: string): string {
  const lines = content.split('\n');
  let inRecipe = false;
  return lines
    .map((line) => {
      if (/^[A-Za-z0-9_.][A-Za-z0-9_.\-/ ]*:(?!=)/.test(line)) {
        inRecipe = true; // target line — recipes follow
        return line;
      }
      if (line.trim() === '') return line; // blank lines don't end a recipe block
      if (/^\S/.test(line)) {
        inRecipe = false; // unindented, non-target → out of recipe
        return line;
      }
      if (inRecipe && /^[ ]+/.test(line)) {
        return line.replace(/^[ \t]+/, '\t'); // normalise leading whitespace to one tab
      }
      return line;
    })
    .join('\n');
}

/**
 * Stack-aware files (Makefile, scripts, startup.md) live at the repo root, so a
 * `cd <repo> &&` or `<repo>/` path prefix the LLM sometimes adds is wrong. Strip it.
 */
export function stripRepoPrefix(content: string, repoName: string | null): string {
  if (!repoName) return content;
  const esc = repoName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content
    .replace(new RegExp(`cd ${esc}\\s*&&\\s*`, 'g'), '')    // cd betterworld && X → X
    .replace(new RegExp(`(^|[\\s\`(])${esc}/`, 'g'), '$1')  // pytest betterworld/ → pytest
    .replace(/[ \t]+$/gm, '');                              // tidy any dangling trailing space
}

/** Safety net: strip any {{PLACEHOLDER}} text the LLM left behind. */
export function sanitisePlaceholders(content: string): string {
  return content
    .replace(/^## \{\{.*?\}\}\s*$/gm, '')   // remove placeholder-only headings
    .replace(/\{\{[^}]+\}\}/g, '')          // remove inline placeholders
    .replace(/\n{3,}/g, '\n\n')             // collapse extra blank lines
    .trim();
}

export async function rewriteToCanonical(
  artifact: RewriteArtifact,
  target: string,
  provider: LLMProvider,
): Promise<RewriteResult> {
  const template = loadTemplate(artifact.templateFile);
  assertTemplateLoaded(artifact.templateFile, template);

  const sourceContents: string[] = [];
  const extractedFrom: string[] = [];
  for (const sourceFile of artifact.sourceFiles) {
    const srcPath = join(target, sourceFile);
    if (existsSync(srcPath)) {
      const content = readFileSync(srcPath, 'utf-8');
      if (content.trim().length > 0) {
        sourceContents.push(`=== ${sourceFile} ===\n${content.slice(0, 2000)}`);
        extractedFrom.push(sourceFile);
      }
    }
  }

  const stackInfo = isStackAware(artifact.filename) ? detectStack(target) : null;
  const repoName = isStackAware(artifact.filename) ? (target.split('/').filter(Boolean).pop() ?? null) : null;

  const raw = await provider.chat(
    buildSystemPrompt(artifact.filename),
    buildRewritePrompt(artifact.filename, template, sourceContents, artifact.currentContent, stackInfo, repoName),
    // Artifacts run up to MAX_LINES (~300) lines — give the model enough output
    // budget so AGENTS.md / CONSTRAINTS.md etc. are never truncated mid-section.
    { fast: false, maxTokens: 4096 },
  );

  const changes: string[] = [];
  let content = cleanLLMOutput(raw);

  // JSON artifacts (feature_list.json): validate and fall back to the template on
  // invalid JSON. Skip all markdown-only post-processing (headings, docs-links, tabs).
  if (artifact.filename.endsWith('.json')) {
    try {
      JSON.parse(content);
    } catch {
      content = template;
      changes.push('invalid JSON from model — used template');
    }
    if (extractedFrom.length > 0) changes.push(`extracted from ${extractedFrom.join(', ')}`);
    return { content, changes, extractedFrom };
  }

  // Stack-aware files live at the repo root — remove any self-repo path prefix.
  if (isStackAware(artifact.filename)) {
    content = stripRepoPrefix(content, repoName);
  }

  // Makefiles need TAB-indented recipes — repair LLM space indentation.
  if (artifact.filename === 'Makefile') {
    content = fixMakefileTabs(content);
  }

  // Deterministic heading correction — restore drifted headings to canonical.
  if (template.trim().length > 0) {
    const { drifted, canonical } = findDriftedHeadings(content, template);
    if (drifted.length > 0) {
      content = replaceHeadings(content, drifted, canonical);
      for (let i = 0; i < drifted.length; i++) {
        changes.push(`heading: ${drifted[i]} → ${canonical[i]}`);
      }
    }
  }

  // Point cross-references at the docs/ layout deterministically.
  content = linkDocsReferences(content, artifact.filename);

  // Enforce the hard 300-line cap.
  const lines = content.split('\n');
  if (lines.length > MAX_LINES) {
    content = lines.slice(0, MAX_LINES).join('\n');
    changes.push(`capped to ${MAX_LINES} lines`);
  }

  if (extractedFrom.length > 0) {
    changes.push(`extracted from ${extractedFrom.join(', ')}`);
  }

  return { content, changes, extractedFrom };
}

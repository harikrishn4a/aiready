import { readFileSync, existsSync } from 'fs';
import { basename, join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import { loadTemplate, assertTemplateLoaded } from './generator.js';
import { cleanLLMOutput } from './output.js';
import { findDriftedHeadings, replaceHeadings } from './corrector.js';
import { artifactOutputPath, isDocsArtifact } from '../utils/layout.js';

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
): string {
  const parts: string[] = [
    `Create ${filename} following this template exactly:`,
    `=== TEMPLATE ===`,
    templateContent,
    `=== END TEMPLATE ===`,
  ];

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

  const raw = await provider.chat(
    buildSystemPrompt(artifact.filename),
    buildRewritePrompt(artifact.filename, template, sourceContents, artifact.currentContent),
    { fast: false },
  );

  const changes: string[] = [];
  let content = cleanLLMOutput(raw);

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

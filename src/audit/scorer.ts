import { basename } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import { resolveExamplesDir } from '../utils/examples-dir.js';
import type { RepoFiles } from './loader.js';
import type { FileMapping, Subsystem } from './mapper.js';
import { crossRef } from './cross-ref.js';
import type { CrossRefResult } from './cross-ref.js';
import {
  loadTemplates, extractSectionHeadings, TEMPLATE_SUBSYSTEM_MAP,
  detectFileType,
  REQUIRED_MAKEFILE_TARGETS,
  REQUIRED_INIT_SH_PATTERNS,
  REQUIRED_VERIFY_SH_PATTERNS,
  REQUIRED_JSON_KEYS,
} from './templates.js';
import type { LoadedTemplates } from './templates.js';

export interface SubsystemScore {
  score: number;
  structuralScore: number;
  contentScore: number;
  presentSections: string[];
  missingSections: string[];
  isHarnessArtifact: boolean;
  gaps: string[];
  findings: Finding[];
  files: string[];
}

export interface Finding {
  type: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface ScoredResult {
  identity: SubsystemScore;
  verification: SubsystemScore;
  state: SubsystemScore;
  memory: SubsystemScore;
  constraints: SubsystemScore;
  overall: number;
  crossRef: CrossRefResult;
}

const SUBSYSTEMS: Subsystem[] = ['identity', 'verification', 'state', 'memory', 'constraints'];

// Build a compact section list from a template for inclusion in system prompt
function templateSectionSummary(subsystem: string, templates: LoadedTemplates): string {
  const primaryFiles = TEMPLATE_SUBSYSTEM_MAP[subsystem]?.primary ?? [];
  const parts: string[] = [];
  for (const file of primaryFiles) {
    const secs = templates.sections[file];
    if (secs && secs.length > 0) {
      parts.push(`${file}: ${secs.join(' | ')}`);
    }
  }
  return parts.length > 0 ? parts.join('\n') : '(no sections defined)';
}

function buildScoringSystemPrompt(templates: LoadedTemplates): string {
  const templateSummaries = SUBSYSTEMS.map((sub) =>
    `${sub.toUpperCase()}:\n${templateSectionSummary(sub, templates)}`,
  ).join('\n\n');

  return `You are scoring AI agent harness artifacts against their canonical template standards.

TEMPLATE REFERENCE — ideal section structure per subsystem:
${templateSummaries}

SCORING RULES:
- A file scores well when it follows the template structure and fills sections with real, specific content.
- A workflow doc, changelog, or implementation log scores MAX 20 even if well-written — these are not harness artifacts.
- Partial credit when content is present in a non-canonical file: score the actual content quality, warn about location.
- If constraints content exists inside AGENTS.md / CLAUDE.md, score the constraint content — do not return 0.
- For each subsystem: is_harness_artifact=true only if the file is intentionally written as an agent harness file.

Return ONLY valid JSON with this exact structure:
{
  "identity":     { "score": 0-100, "is_harness_artifact": true|false, "findings": [{"type":"pass"|"warn"|"fail","message":"..."}] },
  "verification": { "score": 0-100, "is_harness_artifact": true|false, "findings": [] },
  "state":        { "score": 0-100, "is_harness_artifact": true|false, "findings": [] },
  "memory":       { "score": 0-100, "is_harness_artifact": true|false, "findings": [] },
  "constraints":  { "score": 0-100, "is_harness_artifact": true|false, "findings": [] }
}`;
}

interface LLMScoreEntry {
  score: number;
  is_harness_artifact?: boolean;
  findings?: Finding[];
  gaps?: string[];
}

interface LLMScoreResponse {
  identity?: LLMScoreEntry;
  verification?: LLMScoreEntry;
  state?: LLMScoreEntry;
  memory?: LLMScoreEntry;
  constraints?: LLMScoreEntry;
}

function parseScorerResponse(text: string): LLMScoreResponse {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as LLMScoreResponse;
  } catch {
    return {};
  }
}

function normalizeFindings(entry: LLMScoreEntry): Finding[] {
  if (Array.isArray(entry.findings)) {
    return entry.findings
      .filter((f) => (f.type === 'pass' || f.type === 'warn' || f.type === 'fail') && typeof f.message === 'string')
      .map((f) => ({ type: f.type, message: f.message }));
  }
  if (Array.isArray(entry.gaps)) {
    return entry.gaps
      .filter((g) => typeof g === 'string')
      .map((message) => ({ type: 'fail' as const, message }));
  }
  return [];
}

export function scoreMakefileStructure(
  content: string,
): { score: number; present: string[]; missing: string[] } {
  const definedTargets = (content.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/gm) ?? [])
    .map((t) => t.replace(':', '').trim());

  const present: string[] = [];
  const missing: string[] = [];

  for (const required of REQUIRED_MAKEFILE_TARGETS) {
    const options = required.split('|');
    const found = options.find((opt) => definedTargets.includes(opt));
    if (found) present.push(found);
    else missing.push(required);
  }

  return {
    score: Math.round((present.length / REQUIRED_MAKEFILE_TARGETS.length) * 100),
    present,
    missing,
  };
}

export function scoreShellStructure(
  filename: string,
  content: string,
): { score: number; present: string[]; missing: string[] } {
  const base = basename(filename);
  const patterns = base.includes('init') ? REQUIRED_INIT_SH_PATTERNS : REQUIRED_VERIFY_SH_PATTERNS;
  const present: string[] = [];
  const missing: string[] = [];

  for (const pattern of patterns) {
    if (pattern.test(content)) present.push(pattern.source);
    else missing.push(pattern.source);
  }

  return {
    score: Math.round((present.length / patterns.length) * 100),
    present,
    missing,
  };
}

export function scoreJsonStructure(
  filename: string,
  content: string,
): { score: number; present: string[]; missing: string[] } {
  const base = basename(filename);
  const requiredKeys = REQUIRED_JSON_KEYS[base] ?? [];

  if (requiredKeys.length === 0) return { score: 100, present: [], missing: [] };

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(content) as Record<string, unknown>;
  } catch {
    return { score: 0, present: [], missing: requiredKeys };
  }

  const present = requiredKeys.filter((k) => k in parsed);
  const missing = requiredKeys.filter((k) => !(k in parsed));
  return {
    score: Math.round((present.length / requiredKeys.length) * 100),
    present,
    missing,
  };
}

export function scoreArchitectureStructure(
  content: string,
): { score: number; present: string[]; missing: string[] } {
  const checks = [
    { name: 'Responsibilities sections', pass: /Responsibilities/i.test(content) },
    { name: 'Must NOT boundaries',       pass: /Must NOT|MUST NOT/i.test(content) },
    { name: 'Module map or table',       pass: /\|.*\|.*\|/m.test(content) },
    { name: 'Data flow documentation',   pass: /→|->|data flow|pipeline/i.test(content) },
  ];
  const present = checks.filter((c) => c.pass).map((c) => c.name);
  const missing = checks.filter((c) => !c.pass).map((c) => c.name);
  return {
    score: Math.round((present.length / checks.length) * 100),
    present,
    missing,
  };
}

function scoreMarkdownStructure(
  content: string,
  templateSections: string[],
): { score: number; present: string[]; missing: string[] } {
  if (templateSections.length === 0) {
    return { score: 0, present: [], missing: [] };
  }

  const fileSections = extractSectionHeadings(content);
  const present: string[] = [];
  const missing: string[] = [];

  for (const section of templateSections) {
    const sectionLower = section.toLowerCase();
    const found = fileSections.some(
      (s) => s.toLowerCase().includes(sectionLower) || sectionLower.includes(s.toLowerCase()),
    );
    if (found) present.push(section);
    else missing.push(section);
  }

  return {
    score: Math.round((present.length / templateSections.length) * 100),
    present,
    missing,
  };
}

export function scoreStructural(
  filename: string,
  fileContent: string,
  templateSections: string[],
): { score: number; present: string[]; missing: string[] } {
  const fileType = detectFileType(filename);
  switch (fileType) {
    case 'makefile':
      return scoreMakefileStructure(fileContent);
    case 'shell':
      return scoreShellStructure(filename, fileContent);
    case 'json':
      return scoreJsonStructure(filename, fileContent);
    case 'markdown': {
      const base = basename(filename).toLowerCase();
      if (base === 'architecture.md') return scoreArchitectureStructure(fileContent);
      return scoreMarkdownStructure(fileContent, templateSections);
    }
    default:
      return scoreMarkdownStructure(fileContent, templateSections);
  }
}

export function combineScores(structuralScore: number, contentScore: number): number {
  return Math.round(structuralScore * 0.4 + contentScore * 0.6);
}

function emptyScore(templateSections: string[]): SubsystemScore {
  const message = 'No file found serving this subsystem';
  return {
    score: 0,
    structuralScore: 0,
    contentScore: 0,
    presentSections: [],
    missingSections: templateSections,
    isHarnessArtifact: false,
    gaps: [message],
    findings: [{ type: 'fail', message }],
    files: [],
  };
}

function buildSubsystemContent(
  subsystem: Subsystem,
  mdFiles: RepoFiles['mdFiles'],
  mappings: FileMapping[],
): { files: string[]; content: string; fileContents: Map<string, string> } {
  const mappedPaths = mappings.filter((m) => m.subsystems.includes(subsystem)).map((m) => m.path);
  if (mappedPaths.length === 0) return { files: [], content: '', fileContents: new Map() };

  const fileMap = new Map(mdFiles.map((f) => [f.path, f.fullContent]));
  const sections = mappedPaths.map((p) => {
    const content = fileMap.get(p) ?? '';
    return `=== ${p} ===\n${content}`;
  });
  const fileContents = new Map(mappedPaths.map((p) => [p, fileMap.get(p) ?? '']));
  return { files: mappedPaths, content: sections.join('\n\n'), fileContents };
}

function getTemplateSectionsForSubsystem(subsystem: string, templates: LoadedTemplates): string[] {
  const primaryFiles = TEMPLATE_SUBSYSTEM_MAP[subsystem]?.primary ?? [];
  const allSections: string[] = [];
  for (const file of primaryFiles) {
    const secs = templates.sections[file];
    if (secs) allSections.push(...secs);
  }
  return [...new Set(allSections)];
}

export async function scoreRepo(
  files: RepoFiles,
  mappings: FileMapping[],
  provider: LLMProvider,
  examplesDir?: string,
): Promise<ScoredResult> {
  const templates = await loadTemplates(examplesDir ?? resolveExamplesDir());

  // Build per-subsystem content
  const subsystemContents = SUBSYSTEMS.map((s) => ({
    subsystem: s,
    ...buildSubsystemContent(s, files.mdFiles, mappings),
  }));

  // Compute structural scores deterministically (no LLM needed)
  const structuralScores: Record<string, ReturnType<typeof scoreStructural>> = {};
  for (const { subsystem, files: subsysFiles, fileContents } of subsystemContents) {
    const templateSections = getTemplateSectionsForSubsystem(subsystem, templates);
    if (subsysFiles.length === 0) {
      structuralScores[subsystem] = { score: 0, present: [], missing: templateSections };
    } else {
      const perFile = subsysFiles.map((f) =>
        scoreStructural(f, fileContents.get(f) ?? '', templateSections),
      );
      const avgScore = Math.round(perFile.reduce((sum, r) => sum + r.score, 0) / perFile.length);
      const present = [...new Set(perFile.flatMap((r) => r.present))];
      const missing = [...new Set(perFile.flatMap((r) => r.missing))].filter((m) => !present.includes(m));
      structuralScores[subsystem] = { score: avgScore, present, missing };
    }
  }

  // One LLM call for content quality scoring (template-aware)
  const contentSections = subsystemContents
    .map(({ subsystem, content }) => {
      if (!content) return `### ${subsystem}\n(no files mapped)`;
      return `### ${subsystem}\n${content}`;
    })
    .join('\n\n');

  const text = await provider.chat(
    buildScoringSystemPrompt(templates),
    `Score this repository's AI harness across all 5 subsystems:\n\n${contentSections}`,
    { fast: false },
  );

  const llmScores = parseScorerResponse(text);

  function toSubsystemScore(key: Subsystem): SubsystemScore {
    const templateSections = getTemplateSectionsForSubsystem(key, templates);
    const structural = structuralScores[key] ?? { score: 0, present: [], missing: templateSections };
    const { files: subsysFiles } = subsystemContents.find((s) => s.subsystem === key) ?? { files: [] };

    if (subsysFiles.length === 0) {
      return emptyScore(templateSections);
    }

    const entry = llmScores[key];
    if (!entry) {
      return {
        score: 0,
        structuralScore: structural.score,
        contentScore: 0,
        presentSections: structural.present,
        missingSections: structural.missing,
        isHarnessArtifact: false,
        gaps: ['LLM did not return a score for this subsystem'],
        findings: [{ type: 'fail', message: 'LLM did not return a score for this subsystem' }],
        files: subsysFiles,
      };
    }

    const findings = normalizeFindings(entry);
    const rawContentScore = Math.min(100, Math.max(0, Math.round(entry.score)));
    const isHarness = entry.is_harness_artifact !== false; // default true if not specified
    const contentScore = isHarness ? rawContentScore : Math.min(rawContentScore, 20);
    const finalScore = combineScores(structural.score, contentScore);
    const gaps = findings.filter((f) => f.type === 'warn' || f.type === 'fail').map((f) => f.message);

    return {
      score: finalScore,
      structuralScore: structural.score,
      contentScore,
      presentSections: structural.present,
      missingSections: structural.missing,
      isHarnessArtifact: isHarness,
      gaps,
      findings,
      files: subsysFiles,
    };
  }

  const identity     = toSubsystemScore('identity');
  const verification = toSubsystemScore('verification');
  const state        = toSubsystemScore('state');
  const memory       = toSubsystemScore('memory');
  const constraints  = toSubsystemScore('constraints');

  const overall = Math.round(
    (identity.score + verification.score + state.score + memory.score + constraints.score) / 5,
  );

  const xref = crossRef(files, mappings);

  return { identity, verification, state, memory, constraints, overall, crossRef: xref };
}

import type { LLMProvider } from '../utils/llm.js';
import type { RepoFile } from './loader.js';

export type Subsystem = 'identity' | 'verification' | 'state' | 'memory' | 'constraints';

export interface FileMapping {
  path: string;
  subsystems: Subsystem[];
}

const TRIAGE_SYSTEM = `You are a repository analyst. Given a list of files with short previews,
identify which files could plausibly serve as harness artifacts for AI
coding agents.

Harness artifacts include: agent instructions, project progress tracking,
architecture documentation, constraints or rules, session state,
design decisions.

Exclude: changelogs, license files, generated API docs, package readmes,
dependency documentation, test fixtures, lock files.

Respond with valid JSON only:
{ "relevant": ["path/to/file.md", ...] }`;

const MAPPER_SYSTEM = `You are classifying repository markdown files by AI agent harness subsystem.

There are exactly 5 subsystems:
- identity: File describes what the project is, its purpose, stack, version, or high-level structure
- verification: File contains commands to build/test/validate work, CI configuration, or runbooks
- state: File tracks current progress, session state, what is done, blocked, or next
- memory: File maps the architecture, module responsibilities, file structure, or code navigation
- constraints: File defines rules agents must follow, using MUST or MUST NOT language

For each file provided (path and first 200 characters), return which subsystems it belongs to.
A file can belong to multiple subsystems. Omit files with no harness relevance.

Return ONLY valid JSON with no explanation:
{"mappings":[{"path":"file.md","subsystems":["identity"]}]}`;

interface TriageResponse {
  relevant: string[];
}

interface MapperResponse {
  mappings: Array<{ path: string; subsystems: string[] }>;
}

const VALID_SUBSYSTEMS = new Set<Subsystem>([
  'identity', 'verification', 'state', 'memory', 'constraints',
]);

function firstLines(content: string, lineCount: number): string {
  return content.split('\n').slice(0, lineCount).join('\n');
}

function parseTriageResponse(text: string): string[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as TriageResponse;
    if (!Array.isArray(parsed.relevant)) return [];
    return parsed.relevant.filter((p): p is string => typeof p === 'string');
  } catch {
    return [];
  }
}

function parseMapperResponse(text: string): FileMapping[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as MapperResponse;
    if (!Array.isArray(parsed.mappings)) return [];
    return parsed.mappings
      .filter((m) => typeof m.path === 'string' && Array.isArray(m.subsystems))
      .map((m) => ({
        path: m.path,
        subsystems: (m.subsystems as string[]).filter((s): s is Subsystem =>
          VALID_SUBSYSTEMS.has(s as Subsystem),
        ),
      }))
      .filter((m) => m.subsystems.length > 0);
  } catch {
    return [];
  }
}

const SUBSYSTEM_SIGNAL_PATTERNS: Record<Subsystem, RegExp[]> = {
  identity: [
    /(^|\n)\s*#{1,6}\s*(project\s+overview|project\s+purpose|what\s+this\s+is|what\s+this\s+project\s+does)\b/i,
    /\btech\s+stack\b/i,
    /\bstack\s+with\s+versions?\b/i,
    /\brepo(sitory)?\s+structure\b/i,
    /\bagent\s+(entry\s+point|instructions?)\b/i,
  ],
  verification: [
    /(^|\n)\s*#{1,6}\s*(verification|verification\s+commands|definition\s+of\s+done|test\s+plan)\b/i,
    /\bnpm\s+run\s+(build|test|lint|typecheck)\b/,
    /\b(pnpm|yarn|bun)\s+(build|test|lint|typecheck)\b/,
    /\b(pytest|cargo\s+test|go\s+test|make\s+(test|check|verify))\b/,
  ],
  state: [
    /(^|\n)\s*#{1,6}\s*(current\s+state|current\s+status|progress|session\s+handoff|handoff|verification\s+run)\b/i,
    /\b(completed|in\s+progress|blocked|next\s+(best\s+)?step|last\s+verified)\b/i,
  ],
  memory: [
    /(^|\n)\s*#{1,6}\s*(architecture|module\s+map|structure|data\s+flow|key\s+files)\b/i,
    /\b(module\s+responsibilit(y|ies)|codebase\s+structure|dependency\s+relationships?|file\s+map)\b/i,
  ],
  constraints: [
    /(^|\n)\s*#{1,6}\s*(key\s+)?constraints?\b/i,
    /\bMUST\s+NOT\b/,
    /\bMUST\b/,
    /\bmust\s+not\b/i,
    /\bdo\s+not\b/i,
    /\bnever\b/i,
    /\bforbidden\b/i,
  ],
};

function detectSubsystemSignals(content: string): Subsystem[] {
  return Object.entries(SUBSYSTEM_SIGNAL_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(content)))
    .map(([subsystem]) => subsystem as Subsystem);
}

function addSubsystem(mapping: FileMapping, subsystem: Subsystem): FileMapping {
  if (mapping.subsystems.includes(subsystem)) return mapping;
  return { ...mapping, subsystems: [...mapping.subsystems, subsystem] };
}

function augmentMappingsWithContentSignals(files: RepoFile[], mappings: FileMapping[]): FileMapping[] {
  const byPath = new Map(mappings.map((mapping) => [mapping.path, mapping]));

  for (const file of files) {
    const subsystems = detectSubsystemSignals(file.fullContent);
    if (subsystems.length === 0) continue;

    const existing = byPath.get(file.path);
    if (existing) {
      byPath.set(
        file.path,
        subsystems.reduce((mapping, subsystem) => addSubsystem(mapping, subsystem), existing),
      );
    } else {
      byPath.set(file.path, { path: file.path, subsystems });
    }
  }

  return [...byPath.values()];
}

async function triageFiles(mdFiles: RepoFile[], provider: LLMProvider): Promise<string[]> {
  const fileList = mdFiles
    .map((f) => `- path: ${f.path}\n  preview: ${JSON.stringify(firstLines(f.fullContent, 5))}`)
    .join('\n');

  const text = await provider.chat(
    TRIAGE_SYSTEM,
    `Identify harness-relevant files:\n\n${fileList}`,
    { fast: true, temperature: 0, seed: 7 },
  );
  return parseTriageResponse(text);
}

async function classifyFiles(
  relevantFiles: RepoFile[],
  provider: LLMProvider,
): Promise<FileMapping[]> {
  const fileList = relevantFiles
    .map((f) => `- path: ${f.path}\n  preview: ${JSON.stringify(firstLines(f.fullContent, 50))}`)
    .join('\n');

  const text = await provider.chat(
    MAPPER_SYSTEM,
    `Classify these repository files:\n\n${fileList}`,
    { fast: true, temperature: 0, seed: 7 },
  );
  return parseMapperResponse(text);
}

export async function mapFiles(
  mdFiles: RepoFile[],
  provider: LLMProvider,
  usedGraphify = false,
): Promise<FileMapping[]> {
  if (mdFiles.length === 0) return [];

  // Graphify already selected a semantic subset — skip triage
  if (usedGraphify) {
    return augmentMappingsWithContentSignals(mdFiles, await classifyFiles(mdFiles, provider));
  }

  const relevantPaths = await triageFiles(mdFiles, provider);
  if (relevantPaths.length === 0) return augmentMappingsWithContentSignals(mdFiles, []);

  const pathSet = new Set(relevantPaths);
  const relevantFiles = mdFiles.filter((f) => pathSet.has(f.path));
  if (relevantFiles.length === 0) return augmentMappingsWithContentSignals(mdFiles, []);

  return augmentMappingsWithContentSignals(mdFiles, await classifyFiles(relevantFiles, provider));
}

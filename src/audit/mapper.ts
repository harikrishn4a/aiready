import type { LLMProvider } from '../utils/llm.js';
import type { RepoFile } from './loader.js';

export type Subsystem = 'identity' | 'verification' | 'state' | 'memory' | 'constraints';

export interface FileMapping {
  path: string;
  subsystems: Subsystem[];
}

const TRIAGE_SYSTEM = `You are a repository analyst. Given a list of files with short previews,
identify which files could plausibly serve as a source for an AI coding
agent's harness — by their CONTENT, regardless of filename.

Relevant content includes: agent instructions; project purpose/overview;
dependency MANIFESTS and stack/version info (e.g. requirements.txt,
package.json, pyproject.toml, go.mod, Cargo.toml); build/test/CI config
(Makefile, Dockerfile, CI workflows, test configs); progress / roadmap /
feature plans / status / session state; architecture or module maps;
constraints or rules; design decisions.

Exclude only: lock files, secrets/.env, binaries, license files, generated
API docs, and test fixtures.

Respond with valid JSON only:
{ "relevant": ["path/to/file", ...] }`;

const MAPPER_SYSTEM = `You are classifying repository files (markdown docs, dependency manifests,
and build/CI config) by AI agent harness subsystem, based on their CONTENT.

There are exactly 5 subsystems:
- identity: what the project is, its purpose, tech stack, or pinned dependency
  versions. Dependency manifests (package.json, requirements.txt, pyproject.toml,
  go.mod, Cargo.toml, pubspec.yaml, …) belong here — they carry the stack/versions.
- verification: how to build/test/validate work — Makefile, scripts, CI workflows,
  Dockerfile, test configs (pytest.ini, tox.ini), or documented run commands
- state: current progress, session state, roadmaps, feature plans, what is done,
  blocked, or next
- memory: architecture, module responsibilities, file structure, or code navigation
- constraints: rules agents must follow, using MUST / MUST NOT language

For each file provided (path and preview), return which subsystems it belongs to.
A file can belong to multiple subsystems. Omit files with no harness relevance.

Return ONLY valid JSON with no explanation:
{"mappings":[{"path":"file","subsystems":["identity"]}]}`;

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

export interface MapOptions {
  /** Paths always sent to classification, even if triage omits them (seeds). */
  forceKeep?: string[];
}

export async function mapFiles(
  files: RepoFile[],
  provider: LLMProvider,
  opts: MapOptions = {},
): Promise<FileMapping[]> {
  if (files.length === 0) return [];

  // Triage always runs to bound the (now wide) candidate set, but seed files are
  // force-kept so a relevant manifest / feature doc is never dropped by triage.
  const forceKeep = new Set(opts.forceKeep ?? []);
  const triageRelevant = new Set(await triageFiles(files, provider));
  const toClassify = files.filter((f) => triageRelevant.has(f.path) || forceKeep.has(f.path));
  const classifySet = toClassify.length > 0 ? toClassify : files;

  return augmentMappingsWithContentSignals(files, await classifyFiles(classifySet, provider));
}

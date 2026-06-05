import type { LLMProvider } from '../utils/llm.js';
import type { RepoFile } from './loader.js';

export type Subsystem = 'identity' | 'verification' | 'state' | 'memory' | 'constraints';

export interface FileMapping {
  path: string;
  subsystems: Subsystem[];
}

const TRIAGE_SYSTEM = `You are a repository analyst. Given a list of file paths,
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

// Sends filenames only — no content previews — to minimise triage cost
async function triageByFilename(mdFiles: RepoFile[], provider: LLMProvider): Promise<string[]> {
  const fileList = mdFiles.map((f) => `- ${f.path}`).join('\n');

  const text = await provider.chat(
    TRIAGE_SYSTEM,
    `Identify harness-relevant files from these paths:\n\n${fileList}`,
    { fast: true },
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
    { fast: true },
  );
  return parseMapperResponse(text);
}

export async function mapFiles(
  mdFiles: RepoFile[],
  provider: LLMProvider,
  usedGraphify = false,
): Promise<FileMapping[]> {
  if (mdFiles.length === 0) return [];

  // Graphify already ranked files by centrality — skip triage
  if (usedGraphify) {
    return classifyFiles(mdFiles, provider);
  }

  const relevantPaths = await triageByFilename(mdFiles, provider);
  if (relevantPaths.length === 0) return [];

  const pathSet = new Set(relevantPaths);
  const relevantFiles = mdFiles.filter((f) => pathSet.has(f.path));
  if (relevantFiles.length === 0) return [];

  return classifyFiles(relevantFiles, provider);
}

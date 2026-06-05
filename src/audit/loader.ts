import { join } from 'path';
import { readFile, listDirs, listFiles, statMtime, exists, walkMdFiles } from '../utils/fs.js';

const HARNESS_FILENAMES = [
  // Agent entry points
  'AGENTS.md',
  'CLAUDE.md',
  'AGENT.md',
  '.windsurfrules',
  '.cursorrules',
  '.github/copilot-instructions.md',
  // State
  'PROGRESS.md',
  'STATUS.md',
  'TODO.md',
  // Memory
  'ARCHITECTURE.md',
  'STRUCTURE.md',
  // Constraints
  'CONSTRAINTS.md',
  'RULES.md',
  // Decisions
  'DECISIONS.md',
  // Session
  'SESSION-HANDOFF.md',
  'HANDOFF.md',
] as const;

const AGENT_ENTRY_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'AGENT.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  'COPILOT.md',
] as const;


const SUBSYSTEM_CONCEPTS: Record<string, string[]> = {
  identity: [
    'agent instructions', 'project overview', 'project purpose',
    'tech stack', 'stack', 'setup guide', 'getting started',
    'project structure', 'architecture overview',
  ],
  verification: [
    'verification', 'test commands', 'build commands', 'ci',
    'lint', 'test suite', 'how to run', 'development workflow',
    'runbook',
  ],
  state: [
    'progress', 'status', 'roadmap', 'feature plan', 'todo',
    'current state', 'session', 'handoff', 'checkpoint',
    'in progress', 'completed', 'blocked',
  ],
  memory: [
    'architecture', 'module map', 'component', 'data flow',
    'system design', 'codebase structure', 'api design',
    'database schema', 'service boundaries',
  ],
  constraints: [
    'constraints', 'rules', 'must not', 'never', 'forbidden',
    'security rules', 'coding standards', 'conventions',
  ],
};

function scoreNodeLabel(label: string, concepts: string[]): number {
  const lower = label.toLowerCase();
  return concepts.filter((c) => lower.includes(c)).length;
}

function loadAgentEntry(targetDir: string): string | null {
  for (const rel of AGENT_ENTRY_CANDIDATES) {
    const filePath = join(targetDir, rel);
    if (exists(filePath)) {
      return readFile(filePath);
    }
  }
  return null;
}

export interface RepoFile {
  path: string;      // relative path from targetDir
  name: string;      // basename
  preview: string;   // first 200 chars of content
  fullContent: string;
}

export interface RepoFiles {
  // LLM pipeline: markdown files — all when no Graphify, semantic subset when Graphify found
  mdFiles: RepoFile[];
  usedGraphify: boolean;
  graphifyPath: string | null;
  guaranteedFiles: string[];
  conceptMatchedFiles: string[];

  // Legacy convenience lookups used by cross-ref and tests
  agentsMd: string | null;
  architectureMd: string | null;
  constraintsMd: string | null;
  progressMd: string | null;
  sessionHandoffMd: string | null;

  packageJsonRaw: string | null;
  packageJson: Record<string, unknown> | null;
  srcDirs: string[];
  rootFiles: string[];
  progressMdModifiedAt: Date | null;
  targetDir: string;
}

// ── Graphify integration ──────────────────────────────────────────────────────

interface GraphifyGraph {
  nodes: Array<{ id: string; file_type?: string; source_file?: string; label?: string }>;
  links: Array<{ source: string; target: string }>;
}

const GRAPHIFY_DIRECT_PATHS = ['graphify-out/graph.json', '.graphify/graph.json'];

function findGraphifyOutput(target: string): string | null {
  for (const p of GRAPHIFY_DIRECT_PATHS) {
    const full = join(target, p);
    if (exists(full)) return full;
  }
  // Check for dated subdirectory: graphify-out/YYYY-MM-DD/graph.json
  const datedBase = join(target, 'graphify-out');
  if (exists(datedBase)) {
    const subdirs = listDirs(datedBase).sort().reverse(); // latest date first
    for (const subdir of subdirs) {
      const candidate = join(datedBase, subdir, 'graph.json');
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function makeRepoFile(target: string, filePath: string): RepoFile | null {
  const full = join(target, filePath);
  if (!exists(full)) return null;
  const content = readFile(full);
  if (content === null) return null;
  return {
    path: filePath,
    name: filePath.split('/').pop() ?? filePath,
    preview: content.slice(0, 200),
    fullContent: content,
  };
}

function loadGuaranteedFiles(target: string): RepoFile[] {
  return HARNESS_FILENAMES
    .map((filePath) => makeRepoFile(target, filePath))
    .filter((f): f is RepoFile => f !== null);
}

function loadFromGraph(target: string, graphPath: string): { files: RepoFile[]; matchedPaths: string[] } {
  const raw = readFile(graphPath);
  if (!raw) return { files: [], matchedPaths: [] };

  let graph: GraphifyGraph;
  try {
    graph = JSON.parse(raw) as GraphifyGraph;
  } catch {
    return { files: [], matchedPaths: [] };
  }

  const fileScores = new Map<string, number>();
  for (const node of graph.nodes ?? []) {
    if (node.file_type && node.file_type !== 'document') continue;
    if (!node.source_file?.endsWith('.md')) continue;
    const label = node.label ?? '';
    const score = Object.values(SUBSYSTEM_CONCEPTS).reduce(
      (total, concepts) => total + scoreNodeLabel(label, concepts),
      0,
    );
    if (score <= 0) continue;
    const current = fileScores.get(node.source_file) ?? 0;
    fileScores.set(node.source_file, current + score);
  }

  const matchedPaths = [...fileScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([filePath]) => filePath);

  const files = matchedPaths
    .map((filePath) => makeRepoFile(target, filePath))
    .filter((f): f is RepoFile => f !== null);
  return { files, matchedPaths: files.map((f) => f.path) };
}

function dedupeFiles(files: RepoFile[]): RepoFile[] {
  const seen = new Set<string>();
  const out: RepoFile[] = [];
  for (const file of files) {
    if (seen.has(file.path)) continue;
    seen.add(file.path);
    out.push(file);
  }
  return out;
}

// ── Public loader ─────────────────────────────────────────────────────────────

export function loadRepo(targetDir: string): RepoFiles {
  const read = (name: string): string | null => readFile(join(targetDir, name));

  const packageJsonRaw = read('package.json');
  let packageJson: Record<string, unknown> | null = null;
  if (packageJsonRaw) {
    try {
      packageJson = JSON.parse(packageJsonRaw) as Record<string, unknown>;
    } catch {
      // malformed JSON — treat as missing
    }
  }

  const agentsMd = loadAgentEntry(targetDir);
  const architectureMd = read('ARCHITECTURE.md') ?? read('architecture.md');
  const constraintsMd = read('CONSTRAINTS.md') ?? read('constraints.md');
  const progressMd = read('PROGRESS.md') ?? read('progress.md');
  const sessionHandoffMd = read('SESSION-HANDOFF.md') ?? read('session-handoff.md');

  const progressMdModifiedAt =
    statMtime(join(targetDir, 'PROGRESS.md')) ??
    statMtime(join(targetDir, 'progress.md'));

  const guaranteed = loadGuaranteedFiles(targetDir);

  // Use Graphify semantic matching when available; otherwise collect all markdown files
  const graphPath = findGraphifyOutput(targetDir);
  let mdFiles: RepoFile[];
  let usedGraphify = false;
  let conceptMatchedFiles: string[] = [];

  if (graphPath) {
    const fromGraph = loadFromGraph(targetDir, graphPath);
    mdFiles = dedupeFiles([...guaranteed, ...fromGraph.files]);
    usedGraphify = true;
    conceptMatchedFiles = fromGraph.matchedPaths;
  } else {
    const rawMdFiles = walkMdFiles(targetDir);
    const walkedFiles = rawMdFiles.map(({ relPath, name, fullContent }) => ({
      path: relPath,
      name,
      preview: fullContent.slice(0, 200),
      fullContent,
    }));
    mdFiles = dedupeFiles([...guaranteed, ...walkedFiles]);
  }

  return {
    mdFiles,
    usedGraphify,
    graphifyPath: graphPath,
    guaranteedFiles: guaranteed.map((f) => f.path),
    conceptMatchedFiles,
    agentsMd,
    architectureMd,
    constraintsMd,
    progressMd,
    sessionHandoffMd,
    packageJsonRaw,
    packageJson,
    srcDirs: listDirs(join(targetDir, 'src')),
    rootFiles: listFiles(targetDir),
    progressMdModifiedAt,
    targetDir,
  };
}

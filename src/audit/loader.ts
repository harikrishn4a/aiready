import { join } from 'path';
import { readFile, listDirs, listFiles, statMtime, exists, walkMdFiles } from '../utils/fs.js';

const AGENT_ENTRY_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'AGENT.md',
  '.cursorrules',
  '.windsurfrules',
  '.github/copilot-instructions.md',
  'COPILOT.md',
] as const;

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
  // LLM pipeline: markdown files — all when no Graphify, top-ranked subset when Graphify found
  mdFiles: RepoFile[];
  usedGraphify: boolean;

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
  nodes: Array<{ id: string; file_type: string; source_file: string }>;
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

function loadFromGraph(target: string, graphPath: string): RepoFile[] {
  const raw = readFile(graphPath);
  if (!raw) return [];

  let graph: GraphifyGraph;
  try {
    graph = JSON.parse(raw) as GraphifyGraph;
  } catch {
    return [];
  }

  // Compute degree per node id from edges
  const nodeDegree = new Map<string, number>();
  for (const link of graph.links ?? []) {
    nodeDegree.set(link.source, (nodeDegree.get(link.source) ?? 0) + 1);
    nodeDegree.set(link.target, (nodeDegree.get(link.target) ?? 0) + 1);
  }

  // Sum degree per source_file, document nodes only
  const fileDegree = new Map<string, number>();
  for (const node of graph.nodes ?? []) {
    if (node.file_type !== 'document') continue;
    if (!node.source_file?.endsWith('.md')) continue;
    const current = fileDegree.get(node.source_file) ?? 0;
    fileDegree.set(node.source_file, current + (nodeDegree.get(node.id) ?? 0));
  }

  // Top 10 by degree descending
  const topFiles = [...fileDegree.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([filePath]) => filePath);

  const repoFiles: RepoFile[] = [];
  for (const filePath of topFiles) {
    const full = join(target, filePath);
    if (!exists(full)) continue;
    const content = readFile(full);
    if (content === null) continue;
    repoFiles.push({
      path: filePath,
      name: filePath.split('/').pop() ?? filePath,
      preview: content.slice(0, 200),
      fullContent: content,
    });
  }
  return repoFiles;
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

  // Use Graphify ranking when available; otherwise collect all markdown files
  const graphPath = findGraphifyOutput(targetDir);
  let mdFiles: RepoFile[];
  let usedGraphify = false;

  if (graphPath) {
    mdFiles = loadFromGraph(targetDir, graphPath);
    usedGraphify = true;
    const rel = graphPath.startsWith(targetDir)
      ? graphPath.slice(targetDir.length + 1)
      : graphPath;
    console.log(`  Using Graphify knowledge graph (${rel})`);
    console.log(`  Top ${mdFiles.length} files by centrality selected`);
  } else {
    const rawMdFiles = walkMdFiles(targetDir);
    mdFiles = rawMdFiles.map(({ relPath, name, fullContent }) => ({
      path: relPath,
      name,
      preview: fullContent.slice(0, 200),
      fullContent,
    }));
  }

  return {
    mdFiles,
    usedGraphify,
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

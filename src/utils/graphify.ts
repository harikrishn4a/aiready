import { join } from 'path';
import { readFile, listDirs, exists } from './fs.js';

export const SUBSYSTEM_CONCEPTS: Record<string, string[]> = {
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

interface GraphifyGraph {
  nodes: Array<{ id: string; file_type?: string; source_file?: string; label?: string }>;
  links: Array<{ source: string; target: string }>;
}

const GRAPHIFY_DIRECT_PATHS = ['graphify-out/graph.json', '.graphify/graph.json'];

export function findGraphifyOutput(target: string): string | null {
  for (const p of GRAPHIFY_DIRECT_PATHS) {
    const full = join(target, p);
    if (exists(full)) return full;
  }
  const datedBase = join(target, 'graphify-out');
  if (exists(datedBase)) {
    const subdirs = listDirs(datedBase).sort().reverse();
    for (const subdir of subdirs) {
      const candidate = join(datedBase, subdir, 'graph.json');
      if (exists(candidate)) return candidate;
    }
  }
  return null;
}

function scoreNodeLabel(label: string, concepts: string[]): number {
  const lower = label.toLowerCase();
  return concepts.filter((c) => lower.includes(c)).length;
}

export function rankGraphifyFiles(
  target: string,
  graphPath: string,
  subsystem: string | null,
  limit = 5,
): string[] {
  const raw = readFile(graphPath);
  if (!raw) return [];

  let graph: GraphifyGraph;
  try {
    graph = JSON.parse(raw) as GraphifyGraph;
  } catch {
    return [];
  }

  const concepts = subsystem && SUBSYSTEM_CONCEPTS[subsystem]
    ? SUBSYSTEM_CONCEPTS[subsystem]
    : Object.values(SUBSYSTEM_CONCEPTS).flat();

  const fileScores = new Map<string, number>();
  for (const node of graph.nodes ?? []) {
    if (node.file_type && node.file_type !== 'document') continue;
    if (!node.source_file?.endsWith('.md')) continue;
    const label = node.label ?? '';
    const score = scoreNodeLabel(label, concepts);
    if (score <= 0) continue;
    const current = fileScores.get(node.source_file) ?? 0;
    fileScores.set(node.source_file, current + score);
  }

  return [...fileScores.entries()]
    .filter(([filePath]) => exists(join(target, filePath)))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([filePath]) => filePath);
}

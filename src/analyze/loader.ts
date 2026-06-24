import { readdirSync } from 'fs';
import { join, extname, basename } from 'path';
import { readFile, exists } from '../utils/fs.js';
import { detectSourceExtensions, SOURCE_EXTENSIONS } from '../utils/detect.js';

export const PER_FILE_CONTENT_CAP = 8000;

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '__pycache__', '.cache', 'vendor', 'venv', '.venv', 'htmlcov',
  '.idea', '.vscode', 'site-packages', '.tox', '.pytest_cache', '.mypy_cache',
  '.ruff_cache', 'graphify-out', '.graphify', '.aiready',
  'tests', '__tests__', 'spec', 'fixtures', 'migrations', 'change_logs',
  'tmp', '.tmp',
]);

const SOURCE_EXT_SET = new Set<string>(SOURCE_EXTENSIONS);

export interface SourceFile {
  path: string;        // relative from targetDir
  name: string;        // basename
  ext: string;         // e.g. '.py'
  moduleName: string;  // basename without extension — used for Level 1 string match
  fullContent: string; // capped at PER_FILE_CONTENT_CAP chars
}

export interface SourceFiles {
  all: SourceFile[];                 // every source file walked (Level 1)
  relevant: SourceFile[];            // stack-filtered, graph-ranked (Level 2)
  usedGraphify: boolean;
  detectedExtensions: Set<string>;
}

interface GraphNode {
  id: string;
  label?: string;
  source_file?: string;
}

interface Graph {
  nodes?: GraphNode[];
}

const GRAPH_CENTRALITY_TERMS = [
  'module', 'service', 'pipeline', 'handler', 'controller',
  'router', 'manager', 'processor', 'orchestrat', 'coordinator',
];

function scoreGraphNode(label: string): number {
  const lower = label.toLowerCase();
  return GRAPH_CENTRALITY_TERMS.filter((t) => lower.includes(t)).length;
}

function rankSourceFilesWithGraph(graphPath: string, files: SourceFile[]): SourceFile[] {
  const raw = readFile(graphPath);
  if (!raw) return files;
  let graph: Graph;
  try { graph = JSON.parse(raw) as Graph; } catch { return files; }

  const scores = new Map<string, number>();
  for (const node of graph.nodes ?? []) {
    if (!node.source_file) continue;
    if (!SOURCE_EXT_SET.has(extname(node.source_file))) continue;
    const score = scoreGraphNode(node.label ?? '');
    if (score > 0) {
      scores.set(node.source_file, (scores.get(node.source_file) ?? 0) + score);
    }
  }

  return [...files].sort((a, b) => {
    const diff = (scores.get(b.path) ?? 0) - (scores.get(a.path) ?? 0);
    if (diff !== 0) return diff;
    return a.path.split('/').length - b.path.split('/').length;
  });
}

export function walkSourceFiles(dirPath: string, relBase = '', depth = 0): SourceFile[] {
  if (depth > 6) return [];
  const results: SourceFile[] = [];
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = readdirSync(dirPath, { withFileTypes: true, encoding: 'utf-8' });
  } catch { return results; }

  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkSourceFiles(fullPath, relPath, depth + 1));
    } else if (entry.isFile()) {
      const ext = extname(entry.name);
      if (!SOURCE_EXT_SET.has(ext)) continue;
      const content = readFile(fullPath);
      if (content === null) continue;
      results.push({
        path: relPath,
        name: entry.name,
        ext,
        moduleName: basename(entry.name, ext),
        fullContent: content.slice(0, PER_FILE_CONTENT_CAP),
      });
    }
  }
  return results;
}

export function loadSourceFiles(targetDir: string, graphifyPath: string | null): SourceFiles {
  const all = walkSourceFiles(targetDir);
  const detectedExtensions = detectSourceExtensions(targetDir);

  let relevant = all.filter((f) => detectedExtensions.has(f.ext));

  let usedGraphify = false;
  if (graphifyPath && exists(graphifyPath)) {
    relevant = rankSourceFilesWithGraph(graphifyPath, relevant);
    usedGraphify = true;
  } else {
    relevant = [...relevant].sort((a, b) =>
      a.path.split('/').length - b.path.split('/').length,
    );
  }

  return { all, relevant, usedGraphify, detectedExtensions };
}

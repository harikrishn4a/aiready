import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export function readFile(filePath: string): string | null {
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

export function exists(filePath: string): boolean {
  return existsSync(filePath);
}

export function listDirs(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
}

export function listFiles(dirPath: string): string[] {
  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((f) => f.isFile())
      .map((f) => f.name);
  } catch {
    return [];
  }
}

export function statMtime(filePath: string): Date | null {
  try {
    return statSync(filePath).mtime;
  } catch {
    return null;
  }
}

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.nuxt',
  '__pycache__', '.cache', 'vendor', 'tmp', '.tmp',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.venv', 'venv', 'htmlcov',
  '.idea', '.vscode', 'site-packages', '.tox',
  'graphify-out', '.graphify', '.aiready',  // tool outputs — not repo content
]);

export interface MdFileEntry {
  relPath: string;
  name: string;
  fullContent: string;
}

export function walkMdFiles(dirPath: string, relBase = '', depth = 0): MdFileEntry[] {
  if (depth > 3) return [];
  const results: MdFileEntry[] = [];
  try {
    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkMdFiles(fullPath, relPath, depth + 1));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const content = readFile(fullPath);
        if (content !== null) {
          results.push({ relPath, name: entry.name, fullContent: content });
        }
      }
    }
  } catch {
    // unreadable directory — skip silently
  }
  return results;
}

import { readFileSync, existsSync, readdirSync, statSync } from 'fs';

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

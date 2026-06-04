import { exists } from './fs.js';
import { join } from 'path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'unknown';

export function detectPackageManager(targetDir: string): PackageManager {
  if (exists(join(targetDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(join(targetDir, 'yarn.lock'))) return 'yarn';
  if (exists(join(targetDir, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

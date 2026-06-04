import { join } from 'path';
import { readFile, listDirs, listFiles, statMtime } from '../utils/fs.js';

export interface RepoFiles {
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

  // Accept common agent file aliases
  const agentsMd = read('AGENTS.md') ?? read('agents.md') ?? read('.agents.md');
  const architectureMd = read('ARCHITECTURE.md') ?? read('architecture.md');
  const constraintsMd = read('CONSTRAINTS.md') ?? read('constraints.md');
  const progressMd = read('PROGRESS.md') ?? read('progress.md');
  const sessionHandoffMd = read('SESSION-HANDOFF.md') ?? read('session-handoff.md');

  const progressMdModifiedAt =
    statMtime(join(targetDir, 'PROGRESS.md')) ??
    statMtime(join(targetDir, 'progress.md'));

  return {
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

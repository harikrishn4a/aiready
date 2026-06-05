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
  // LLM pipeline: all markdown files found in the repo
  mdFiles: RepoFile[];

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

  const rawMdFiles = walkMdFiles(targetDir);
  const mdFiles: RepoFile[] = rawMdFiles.map(({ relPath, name, fullContent }) => ({
    path: relPath,
    name,
    preview: fullContent.slice(0, 200),
    fullContent,
  }));

  return {
    mdFiles,
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

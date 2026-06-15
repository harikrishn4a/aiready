import { join } from 'path';
import { readFile, listDirs, listFiles, statMtime, exists, walkMdFiles } from '../utils/fs.js';
import { findGraphifyOutput, rankGraphifyFiles } from '../utils/graphify.js';
import { DOCS_DIR } from '../utils/layout.js';

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
  // Look for each harness file at the repo root and under docs/ (init writes
  // non-entry artifacts there). Entry points (AGENTS.md etc.) stay at root.
  const candidates = HARNESS_FILENAMES.flatMap((f) =>
    f.endsWith('.md') ? [f, `${DOCS_DIR}/${f}`] : [f],
  );
  return candidates
    .map((filePath) => makeRepoFile(target, filePath))
    .filter((f): f is RepoFile => f !== null);
}

/** Read a harness file from the repo root, falling back to docs/. */
function readHarness(target: string, name: string): string | null {
  return readFile(join(target, name)) ?? readFile(join(target, DOCS_DIR, name));
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
  const architectureMd = readHarness(targetDir, 'ARCHITECTURE.md') ?? readHarness(targetDir, 'architecture.md');
  const constraintsMd = readHarness(targetDir, 'CONSTRAINTS.md') ?? readHarness(targetDir, 'constraints.md');
  const progressMd = readHarness(targetDir, 'PROGRESS.md') ?? readHarness(targetDir, 'progress.md');
  const sessionHandoffMd = readHarness(targetDir, 'SESSION-HANDOFF.md') ?? readHarness(targetDir, 'session-handoff.md');

  const progressMdModifiedAt =
    statMtime(join(targetDir, 'PROGRESS.md')) ??
    statMtime(join(targetDir, 'progress.md')) ??
    statMtime(join(targetDir, DOCS_DIR, 'PROGRESS.md'));

  const guaranteed = loadGuaranteedFiles(targetDir);

  // Use Graphify semantic matching when available; otherwise collect all markdown files
  const graphPath = findGraphifyOutput(targetDir);
  let mdFiles: RepoFile[];
  let usedGraphify = false;
  let conceptMatchedFiles: string[] = [];

  if (graphPath) {
    const matchedPaths = rankGraphifyFiles(targetDir, graphPath, null, 15);
    const fromGraph = matchedPaths
      .map((filePath) => makeRepoFile(targetDir, filePath))
      .filter((f): f is RepoFile => f !== null);
    mdFiles = dedupeFiles([...guaranteed, ...fromGraph]);
    usedGraphify = true;
    conceptMatchedFiles = matchedPaths;
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

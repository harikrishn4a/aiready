import { join } from 'path';
import { readFile, listDirs, listFiles, statMtime, exists, walkMdFiles } from '../utils/fs.js';
import { findGraphifyOutput, rankGraphifyFiles } from '../utils/graphify.js';
import { DOCS_DIR, isDocsArtifact } from '../utils/layout.js';

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

// Non-markdown project files that commonly carry identity (stack/versions) or
// verification (build/test/CI) signal. Collected as candidates so the mapper can
// classify them by content — independent of any fixed per-subsystem name list.
const CONFIG_BASENAMES = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'setup.py', 'setup.cfg',
  'Pipfile', 'environment.yml', 'go.mod', 'Cargo.toml', 'Gemfile', 'pom.xml',
  'build.gradle', 'build.gradle.kts', 'deno.json', 'pubspec.yaml', 'mix.exs',
  'composer.json', 'Dockerfile', 'docker-compose.yml', 'compose.yml', 'Makefile',
  'tox.ini', 'pytest.ini', '.tool-versions', 'tsconfig.json',
]);
const CONFIG_EXTENSIONS = ['.toml', '.yaml', '.yml', '.cfg', '.ini'];
const CONFIG_BLOCKLIST = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock',
  'Cargo.lock', 'Gemfile.lock', 'composer.lock',
]);
const MAX_CONFIG_BYTES = 50_000;

function isConfigCandidate(name: string): boolean {
  if (CONFIG_BLOCKLIST.has(name)) return false;
  if (name.startsWith('.env')) return false;
  if (name.endsWith('.log')) return false;
  if (CONFIG_BASENAMES.has(name)) return true;
  return CONFIG_EXTENSIONS.some((ext) => name.endsWith(ext));
}

// Collect root-level config/manifest files plus common config-dir files
// (.github/workflows/*.yml, scripts/*.sh) as classifiable candidates.
function collectProjectFiles(target: string): RepoFile[] {
  const out: RepoFile[] = [];
  const add = (rel: string): void => {
    const full = join(target, rel);
    const content = readFile(full);
    if (content === null || content.length > MAX_CONFIG_BYTES) return;
    out.push({ path: rel, name: rel.split('/').pop() ?? rel, preview: content.slice(0, 200), fullContent: content });
  };

  for (const name of listFiles(target)) {
    if (isConfigCandidate(name)) add(name);
  }
  for (const name of listFiles(join(target, '.github', 'workflows'))) {
    if (name.endsWith('.yml') || name.endsWith('.yaml')) add(`.github/workflows/${name}`);
  }
  for (const name of listFiles(join(target, 'scripts'))) {
    if (name.endsWith('.sh')) add(`scripts/${name}`);
  }
  return out;
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
  // Paths the mapper must keep through triage (guaranteed harness names, graph
  // matches, and collected config/manifest files) so discovery never drops them.
  seedFiles: string[];
  // Legacy root duplicates excluded from scoring because a docs/ canonical version
  // exists (e.g. root ARCHITECTURE.md when docs/ARCHITECTURE.md was generated).
  ignoredDuplicates: string[];

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
  const configFiles = collectProjectFiles(targetDir);

  // Always walk all markdown so a content-bearing doc (e.g. FEATURE_PLAN.md) is
  // never hidden — Graphify ranking is unioned in as a booster, not a replacement.
  const walkedFiles = walkMdFiles(targetDir).map(({ relPath, name, fullContent }) => ({
    path: relPath,
    name,
    preview: fullContent.slice(0, 200),
    fullContent,
  }));

  const graphPath = findGraphifyOutput(targetDir);
  let conceptMatchedFiles: string[] = [];
  let graphFiles: RepoFile[] = [];
  if (graphPath) {
    conceptMatchedFiles = rankGraphifyFiles(targetDir, graphPath, null, 15);
    graphFiles = conceptMatchedFiles
      .map((filePath) => makeRepoFile(targetDir, filePath))
      .filter((f): f is RepoFile => f !== null);
  }

  const allFiles = dedupeFiles([...guaranteed, ...graphFiles, ...walkedFiles, ...configFiles]);

  // Drop a legacy root duplicate when its canonical docs/ version is present, so the
  // (often larger, stale) root copy isn't scored alongside the generated one.
  const docsPaths = new Set(allFiles.filter((f) => f.path.startsWith(`${DOCS_DIR}/`)).map((f) => f.path));
  const ignoredDuplicates: string[] = [];
  const mdFiles = allFiles.filter((f) => {
    if (f.path.includes('/') || f.name === 'README.md' || !isDocsArtifact(f.path)) return true;
    if (docsPaths.has(`${DOCS_DIR}/${f.path}`)) {
      ignoredDuplicates.push(f.path);
      return false;
    }
    return true;
  });

  // Seeds are force-kept through mapper triage so discovery never drops them.
  const ignored = new Set(ignoredDuplicates);
  const seedFiles = [...new Set([
    ...guaranteed.map((f) => f.path),
    ...conceptMatchedFiles,
    ...configFiles.map((f) => f.path),
  ])].filter((p) => !ignored.has(p));

  return {
    mdFiles,
    usedGraphify: graphPath !== null,
    graphifyPath: graphPath,
    guaranteedFiles: guaranteed.map((f) => f.path),
    conceptMatchedFiles,
    seedFiles,
    ignoredDuplicates,
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

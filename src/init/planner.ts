import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';

export interface ArtifactPlan {
  filename: string;
  action: 'generate' | 'improve' | 'skip';
  subsystem: string | null;
  templateFile: string;
  sourceFiles: string[];
  currentScore: number | null;
  reason: string;
  alwaysGenerate: boolean;
}

export interface InitPlan {
  overall: number;
  target: string;
  artifacts: ArtifactPlan[];
  subsystemSources: Record<string, string[]>;
}

interface CanonicalArtifact {
  filename: string;
  subsystem: string | null;
  template: string;
  alwaysGenerate: boolean;
}

const SKIP_THRESHOLD = 80;

const CANONICAL_ARTIFACTS: CanonicalArtifact[] = [
  { filename: 'AGENTS.md',          subsystem: 'identity',     template: 'agents.md',          alwaysGenerate: false },
  { filename: 'CONSTRAINTS.md',     subsystem: 'constraints',  template: 'constraints.md',     alwaysGenerate: false },
  { filename: 'ARCHITECTURE.md',    subsystem: 'memory',       template: 'architecture.md',    alwaysGenerate: false },
  { filename: 'DECISIONS.md',       subsystem: null,           template: 'decisions.md',       alwaysGenerate: false },
  { filename: 'PROGRESS.md',        subsystem: 'state',        template: 'progress.md',        alwaysGenerate: false },
  { filename: 'SESSION-HANDOFF.md', subsystem: 'state',        template: 'session-handoff.md', alwaysGenerate: false },
  { filename: 'TASK.md',            subsystem: null,           template: 'task.md',            alwaysGenerate: true  },
  { filename: 'features.md',        subsystem: null,           template: 'features.md',        alwaysGenerate: true  },
  { filename: 'feature_list.json',  subsystem: null,           template: 'feature-list.json',  alwaysGenerate: true  },
  { filename: 'QUALITY.md',         subsystem: null,           template: 'quality.md',         alwaysGenerate: true  },
  { filename: 'Makefile',           subsystem: 'verification', template: 'Makefile',           alwaysGenerate: false },
  { filename: 'scripts/init.sh',    subsystem: 'verification', template: 'scripts/init.sh',    alwaysGenerate: false },
  { filename: 'scripts/verify.sh',  subsystem: 'verification', template: 'scripts/verify.sh',  alwaysGenerate: false },
];

const TECH_STACK_FILES = [
  'package.json', 'requirements.txt', 'pyproject.toml',
  'go.mod', 'Cargo.toml', 'pom.xml',
  'setup.sh', 'dev.sh', 'docker-compose.yml', 'Dockerfile',
];

const STRUCTURAL_ARTIFACTS = new Set(['Makefile', 'scripts/init.sh', 'scripts/verify.sh']);

function extractSection(content: string, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = content.indexOf(marker);
  if (start === -1) return '';
  const body = start + marker.length;
  const next = content.indexOf('\n## ', body);
  return next === -1 ? content.slice(body) : content.slice(body, next);
}

function parseSubsystemScores(content: string): Record<string, number> {
  const section = extractSection(content, 'SUBSYSTEM SCORES');
  const scores: Record<string, number> = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^- (\w+):\s*(\d+)/);
    if (m) scores[m[1]] = parseInt(m[2], 10);
  }
  return scores;
}

function parseSubsystemSources(content: string): Record<string, string[]> {
  const section = extractSection(content, 'SUBSYSTEM SOURCES');
  const sources: Record<string, string[]> = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^- (\w+):\s*(.*)/);
    if (m) {
      sources[m[1]] = m[2].split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return sources;
}

function getSourceFiles(
  artifact: CanonicalArtifact,
  subsystemSources: Record<string, string[]>,
  target: string,
): string[] {
  const sources: string[] = [];

  if (artifact.subsystem && subsystemSources[artifact.subsystem]) {
    sources.push(...subsystemSources[artifact.subsystem]);
  }

  if (STRUCTURAL_ARTIFACTS.has(artifact.filename)) {
    for (const f of TECH_STACK_FILES) {
      if (existsSync(join(target, f)) && !sources.includes(f)) {
        sources.push(f);
      }
    }
  }

  const claudeMd = join(target, 'CLAUDE.md');
  if (existsSync(claudeMd) && !sources.includes('CLAUDE.md')) {
    sources.push('CLAUDE.md');
  }

  return [...new Set(sources)];
}

export async function buildInitPlan(planPath: string, target: string): Promise<InitPlan> {
  if (!existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch {
    throw new Error(`Could not read plan file: ${planPath}`);
  }

  const overallMatch = content.match(/^Overall:\s*(\d+)\/100/m);
  if (!overallMatch) {
    throw new Error(`Plan file is missing Overall score: ${planPath}`);
  }
  const overall = parseInt(overallMatch[1], 10);

  const targetMatch = content.match(/^Target:\s*(.+)/m);
  const planTarget = targetMatch ? targetMatch[1].trim() : target;

  const subsystemScores = parseSubsystemScores(content);
  const subsystemSources = parseSubsystemSources(content);

  const artifacts: ArtifactPlan[] = [];

  for (const def of CANONICAL_ARTIFACTS) {
    const filePath = join(target, def.filename);
    const fileExists = existsSync(filePath);
    const score = def.subsystem !== null ? (subsystemScores[def.subsystem] ?? 0) : null;
    const sourceFiles = getSourceFiles(def, subsystemSources, target);

    let action: 'generate' | 'improve' | 'skip';
    let reason: string;

    if (!fileExists) {
      action = 'generate';
      reason = 'file does not exist';
    } else if (def.alwaysGenerate) {
      action = 'generate';
      reason = 'blank template — always regenerate';
    } else if (score !== null && score >= SKIP_THRESHOLD) {
      action = 'skip';
      reason = `score ${score}/100 — already excellent`;
    } else if (score !== null) {
      action = 'improve';
      reason = `score ${score}/100 — below threshold`;
    } else {
      // subsystem is null, file exists, not alwaysGenerate
      action = 'skip';
      reason = 'no subsystem score — file exists, assumed good';
    }

    artifacts.push({
      filename: def.filename,
      action,
      subsystem: def.subsystem,
      templateFile: `examples/${def.template}`,
      sourceFiles,
      currentScore: score,
      reason,
      alwaysGenerate: def.alwaysGenerate,
    });
  }

  return { overall, target: planTarget, artifacts, subsystemSources };
}

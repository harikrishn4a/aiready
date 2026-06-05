import { dirname, join } from 'path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs';
import type { ScoredResult, SubsystemScore } from './scorer.js';
import type { Subsystem } from './mapper.js';

export interface RemediationItem {
  filename: string;
  subsystem: Subsystem | null;
  template: string;
  required_sections: string[];
  source_signals: string[];
  max_lines: number;
  why?: string;
  use_as_sources?: string[];
  write_policy?: string[];
  score?: number;
  findings?: string[];
}

export interface ImproveItem extends RemediationItem {
  section: string;
  missing: string;
  fix: string;
  template_section: string;
}

export interface SkipItem {
  filename: string;
  subsystem: Subsystem | null;
  score: number | null;
  reason: string;
}

export interface ManualReviewItem {
  path: string;
  reason: string;
  suggestion: string;
  subsystem: Subsystem;
  subsystems?: Subsystem[];
  score: number;
}

export interface RemediationPlan {
  generated_at: string;
  target: string;
  overall: number;
  generate: RemediationItem[];
  improve: ImproveItem[];
  skip: SkipItem[];
  source_context: ManualReviewItem[];
  subsystemScores: Record<string, number>;
  subsystemSources: Record<string, string[]>;
}

const MAX_LINES = 300;
const SKIP_THRESHOLD = 80;

function isPlanFile(file: string): boolean {
  return file === 'plan.md' || file === '.aiready/plan.md' || file.endsWith('/.aiready/plan.md');
}

function hasUsefulContent(target: string, file: string): boolean {
  const filePath = join(target, file);
  if (!existsSync(filePath)) return false;
  try {
    return readFileSync(filePath, 'utf8').trim().length > 0;
  } catch {
    return false;
  }
}

interface CanonicalArtifactDef {
  filename: string;
  subsystem: Subsystem | null;
  template: string;
  required: string;
  defaultSources: string[];
  sectionName: string;
  templateSection: string;
}

const CANONICAL_ARTIFACTS: CanonicalArtifactDef[] = [
  {
    filename: 'AGENTS.md',
    subsystem: 'identity',
    template: 'examples/agents.md',
    required: 'project description, stack with versions, verification commands, repo structure',
    defaultSources: ['README.md', 'package.json'],
    sectionName: 'agent entry point',
    templateSection: 'examples/agents.md → project overview',
  },
  {
    filename: 'CONSTRAINTS.md',
    subsystem: 'constraints',
    template: 'examples/constraints.md',
    required: 'MUST/MUST NOT language, forbidden actions, domain-specific rules',
    defaultSources: ['AGENTS.md', 'package.json'],
    sectionName: 'hard constraints',
    templateSection: 'examples/constraints.md → MUST / MUST NOT rules',
  },
  {
    filename: 'ARCHITECTURE.md',
    subsystem: 'memory',
    template: 'examples/architecture.md',
    required: 'module map, module responsibilities, data flow',
    defaultSources: ['package.json'],
    sectionName: 'module map',
    templateSection: 'examples/architecture.md → module map',
  },
  {
    filename: 'DECISIONS.md',
    subsystem: null,
    template: 'examples/decisions.md',
    required: 'key decisions, rationale, alternatives considered',
    defaultSources: ['AGENTS.md', 'package.json'],
    sectionName: 'decisions log',
    templateSection: 'examples/decisions.md → decisions',
  },
  {
    filename: 'PROGRESS.md',
    subsystem: 'state',
    template: 'examples/progress.md',
    required: 'current build status, completed/in-progress/blocked tasks, next best step',
    defaultSources: ['package.json'],
    sectionName: 'current state section',
    templateSection: 'examples/progress.md → Current State',
  },
  {
    filename: 'SESSION-HANDOFF.md',
    subsystem: 'state',
    template: 'examples/session-handoff.md',
    required: 'date, what was completed, what is broken, next best step',
    defaultSources: ['PROGRESS.md', 'package.json'],
    sectionName: 'session handoff',
    templateSection: 'examples/session-handoff.md → handoff summary',
  },
  {
    filename: 'TASK.md',
    subsystem: null,
    template: 'examples/task.md',
    required: 'current task, scope, acceptance criteria',
    defaultSources: ['PROGRESS.md'],
    sectionName: 'task definition',
    templateSection: 'examples/task.md → task',
  },
  {
    filename: 'features.md',
    subsystem: null,
    template: 'examples/features.md',
    required: 'feature list with status',
    defaultSources: ['package.json'],
    sectionName: 'feature list',
    templateSection: 'examples/features.md → features',
  },
  {
    filename: 'feature_list.json',
    subsystem: null,
    template: 'examples/feature-list.json',
    required: 'JSON feature list with id, title, status fields',
    defaultSources: ['features.md'],
    sectionName: 'feature list JSON',
    templateSection: 'examples/feature-list.json → schema',
  },
  {
    filename: 'QUALITY.md',
    subsystem: null,
    template: 'examples/quality.md',
    required: 'quality gates, test coverage requirements, definition of done',
    defaultSources: ['package.json'],
    sectionName: 'quality definition',
    templateSection: 'examples/quality.md → quality gates',
  },
  {
    filename: 'Makefile',
    subsystem: 'verification',
    template: 'examples/Makefile',
    required: 'runnable build/test/lint commands, single canonical verification path',
    defaultSources: ['package.json'],
    sectionName: 'verification commands',
    templateSection: 'examples/Makefile → verification commands',
  },
  {
    filename: 'scripts/init.sh',
    subsystem: 'verification',
    template: 'examples/scripts/init.sh',
    required: 'dependency setup, environment initialization',
    defaultSources: ['package.json', 'Makefile'],
    sectionName: 'init script',
    templateSection: 'examples/scripts/init.sh → init',
  },
  {
    filename: 'scripts/verify.sh',
    subsystem: 'verification',
    template: 'examples/scripts/verify.sh',
    required: 'full verification sequence: build, typecheck, lint, test',
    defaultSources: ['Makefile'],
    sectionName: 'verify script',
    templateSection: 'examples/scripts/verify.sh → verify',
  },
];

const CANONICAL_NAMES = new Set(CANONICAL_ARTIFACTS.map((a) => a.filename));

function usefulSourcesForArtifact(
  target: string,
  def: CanonicalArtifactDef,
  subsystemData: SubsystemScore | null,
): string[] {
  const subsystemFiles = subsystemData
    ? subsystemData.files.filter((f) => f !== def.filename && hasUsefulContent(target, f))
    : [];
  const defaults = def.defaultSources.filter((f) => f !== def.filename && hasUsefulContent(target, f));
  return [...new Set([...subsystemFiles, ...defaults])];
}

function mentionsOtherCanonicalArtifact(gap: string, def: CanonicalArtifactDef): boolean {
  const lower = gap.toLowerCase();
  return CANONICAL_ARTIFACTS
    .filter((artifact) => artifact.filename !== def.filename)
    .some((artifact) => lower.includes(artifact.filename.toLowerCase()));
}

function pickMissingMessage(def: CanonicalArtifactDef, data: SubsystemScore): string {
  return data.gaps.find((gap) => gap.toLowerCase().includes(def.filename.toLowerCase()))
    ?? data.gaps.find((gap) =>
      gap.toLowerCase().includes(def.sectionName.toLowerCase()) &&
      !mentionsOtherCanonicalArtifact(gap, def)
    )
    ?? data.gaps.find((gap) => !mentionsOtherCanonicalArtifact(gap, def))
    ?? `${def.filename} is missing required structure: ${def.required}`;
}

function makeGenerateItem(
  target: string,
  def: CanonicalArtifactDef,
  subsystemData: SubsystemScore | null,
): RemediationItem {
  const sourceFiles = usefulSourcesForArtifact(target, def, subsystemData);
  return {
    filename: def.filename,
    subsystem: def.subsystem,
    template: def.template,
    required_sections: def.required.split(', '),
    source_signals: def.defaultSources,
    max_lines: MAX_LINES,
    use_as_sources: sourceFiles,
    write_policy: [
      'create only if missing',
      'do not overwrite an existing user file without --force',
      `keep artifact under ${MAX_LINES} lines`,
    ],
  };
}

function makeImproveItem(target: string, def: CanonicalArtifactDef, data: SubsystemScore): ImproveItem {
  const missing = pickMissingMessage(def, data);
  return {
    filename: def.filename,
    subsystem: def.subsystem,
    template: def.template,
    required_sections: def.required.split(', '),
    source_signals: def.defaultSources,
    max_lines: MAX_LINES,
    score: data.score,
    findings: data.findings.map((f) => `${f.type}: ${f.message}`),
    why: `Existing ${def.sectionName} scored ${data.score}/100.`,
    use_as_sources: usefulSourcesForArtifact(target, def, data),
    write_policy: [
      'preserve existing useful content',
      'do not overwrite without --force',
      `keep artifact under ${MAX_LINES} lines`,
    ],
    section: def.sectionName,
    missing,
    fix: `Update ${def.filename}'s ${def.sectionName} using ${def.template}; keep this artifact under ${MAX_LINES} lines.`,
    template_section: def.templateSection,
  };
}

export async function buildRemediationPlan(scored: ScoredResult, target: string): Promise<RemediationPlan> {
  const generate: RemediationItem[] = [];
  const improve: ImproveItem[] = [];
  const skip: SkipItem[] = [];
  const sourceContextByPath = new Map<string, ManualReviewItem>();
  const subsystemScores: Record<string, number> = {};
  const subsystemSources: Record<string, string[]> = {};

  for (const subsystem of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
    const data = scored[subsystem];
    subsystemScores[subsystem] = data.score;
    subsystemSources[subsystem] = data.files.filter((f) => !isPlanFile(f));
  }

  for (const def of CANONICAL_ARTIFACTS) {
    const filePath = join(target, def.filename);
    const fileExists = existsSync(filePath);
    const subsystemData = def.subsystem ? scored[def.subsystem] : null;
    const score = subsystemData?.score ?? null;

    if (!fileExists) {
      generate.push(makeGenerateItem(target, def, subsystemData));
    } else if (score === null) {
      skip.push({ filename: def.filename, subsystem: null, score: null, reason: 'no subsystem score — file exists' });
    } else if (score >= SKIP_THRESHOLD) {
      skip.push({ filename: def.filename, subsystem: def.subsystem, score, reason: `score ${score}/100 — already excellent` });
    } else {
      improve.push(makeImproveItem(target, def, subsystemData!));
    }
  }

  for (const subsystem of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
    const data = scored[subsystem];
    const nonCanonical = data.files.filter((f) => !CANONICAL_NAMES.has(f));
    const planFiles = data.files.filter((f) => isPlanFile(f));
    for (const file of [...nonCanonical, ...planFiles]) {
      const existing = sourceContextByPath.get(file);
      if (existing) {
        const subsystems = existing.subsystems ?? [existing.subsystem];
        if (!subsystems.includes(subsystem)) {
          existing.subsystems = [...subsystems, subsystem];
          existing.suggestion = `Use as source context only. Extract durable facts into the canonical ${existing.subsystems.join(', ')} artifacts.`;
          existing.score = Math.min(existing.score, data.score);
        }
      } else {
        sourceContextByPath.set(file, {
          path: file,
          subsystem,
          subsystems: [subsystem],
          score: data.score,
          reason: 'Useful context was found outside a canonical harness artifact.',
          suggestion: `Use as source context only. Extract durable facts into the canonical ${subsystem} artifact.`,
        });
      }
    }
  }

  return {
    generated_at: new Date().toISOString(),
    target,
    overall: scored.overall,
    generate,
    improve,
    skip,
    source_context: [...sourceContextByPath.values()],
    subsystemScores,
    subsystemSources,
  };
}

export function renderRemediationMarkdown(plan: RemediationPlan): string {
  const lines: string[] = [];
  lines.push('# AIReady Plan');
  lines.push(`Generated: ${plan.generated_at}`);
  lines.push(`Target: ${plan.target}`);
  lines.push(`Overall: ${plan.overall}/100`);
  lines.push('');

  if (Object.keys(plan.subsystemScores).length > 0) {
    lines.push('## SUBSYSTEM SCORES');
    for (const [sub, score] of Object.entries(plan.subsystemScores)) {
      lines.push(`- ${sub}: ${score}`);
    }
    lines.push('');
  }

  if (Object.keys(plan.subsystemSources).length > 0) {
    lines.push('## SUBSYSTEM SOURCES');
    for (const [sub, files] of Object.entries(plan.subsystemSources)) {
      lines.push(`- ${sub}: ${files.join(', ')}`);
    }
    lines.push('');
  }

  lines.push('## GENERATE');
  if (plan.generate.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.generate) {
      lines.push(`### ${item.filename}`);
      lines.push(`- subsystem: ${item.subsystem ?? 'n/a'}`);
      lines.push(`- template: ${item.template}`);
      const srcFiles = item.use_as_sources?.length ? item.use_as_sources : item.source_signals;
      lines.push(`- source_files: ${srcFiles.join(', ')}`);
      lines.push(`- required: ${item.required_sections.join(', ')}`);
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## IMPROVE');
  if (plan.improve.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.improve) {
      lines.push(`### ${item.filename}`);
      lines.push(`- subsystem: ${item.subsystem ?? 'n/a'}`);
      lines.push(`- section: ${item.section}`);
      lines.push(`- missing: ${item.missing}`);
      lines.push(`- fix: ${item.fix}`);
      const srcFiles = item.use_as_sources ?? [];
      if (srcFiles.length > 0) lines.push(`- source_files: ${srcFiles.join(', ')}`);
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## SKIP');
  if (plan.skip.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.skip) {
      const scoreStr = item.score !== null ? ` (${item.score}/100)` : '';
      lines.push(`- ${item.filename}${scoreStr} — ${item.reason}`);
    }
  }
  lines.push('');

  lines.push('## SOURCE CONTEXT');
  if (plan.source_context.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.source_context) {
      lines.push(`### ${item.path}`);
      const subsystems = item.subsystems ?? [item.subsystem];
      lines.push(`- subsystems: ${subsystems.join(', ')}`);
      lines.push(`- reason: ${item.reason}`);
      lines.push('');
    }
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

export function writeRemediationPlan(target: string, plan: RemediationPlan): string {
  const planPath = join(target, '.aiready', 'plan.md');
  mkdirSync(dirname(planPath), { recursive: true });
  writeFileSync(planPath, renderRemediationMarkdown(plan), 'utf8');
  return planPath;
}

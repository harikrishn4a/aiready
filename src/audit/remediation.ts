import { dirname, join } from 'path';
import { mkdirSync, writeFileSync } from 'fs';
import type { ScoredResult, SubsystemScore } from './scorer.js';
import type { Subsystem } from './mapper.js';

export interface RemediationItem {
  filename: string;
  subsystem: Subsystem;
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

export interface ManualReviewItem {
  path: string;
  reason: string;
  suggestion: string;
  subsystem: Subsystem;
  score: number;
}

export interface RemediationPlan {
  generated_at: string;
  target: string;
  overall: number;
  generate: RemediationItem[];
  improve: ImproveItem[];
  source_context: ManualReviewItem[];
}

const MAX_LINES = 300;

// Canonical harness artifact names — these can be IMPROVED when weak
const CANONICAL_NAMES = new Set([
  'AGENTS.md', 'CLAUDE.md', 'AGENT.md',
  '.cursorrules', '.windsurfrules', '.github/copilot-instructions.md',
  'PROGRESS.md', 'STATUS.md', 'TODO.md',
  'ARCHITECTURE.md', 'STRUCTURE.md',
  'CONSTRAINTS.md', 'RULES.md',
  'DECISIONS.md',
  'SESSION-HANDOFF.md', 'HANDOFF.md',
  'TASK.md',
]);

// plan.md is an AIReady internal file — never a generate/improve target
function isPlanFile(file: string): boolean {
  return file === 'plan.md' || file === '.aiready/plan.md' || file.endsWith('/.aiready/plan.md');
}

interface ArtifactDef {
  filename: string;
  template: string;
  required: string;
  defaultSources: string[];
}

const ARTIFACT_BY_SUBSYSTEM: Record<Subsystem, ArtifactDef> = {
  identity: {
    filename: 'AGENTS.md',
    template: 'examples/agents.md',
    required: 'project description, stack with versions, verification commands, repo structure',
    defaultSources: ['README.md', 'package.json'],
  },
  verification: {
    filename: 'AGENTS.md',
    template: 'examples/agents.md',
    required: 'runnable build/test/lint commands, single canonical verification path',
    defaultSources: ['package.json'],
  },
  state: {
    filename: 'PROGRESS.md',
    template: 'examples/progress.md',
    required: 'current build status, completed/in-progress/blocked tasks, next best step',
    defaultSources: ['package.json'],
  },
  memory: {
    filename: 'ARCHITECTURE.md',
    template: 'examples/architecture.md',
    required: 'module map, module responsibilities, data flow',
    defaultSources: ['package.json'],
  },
  constraints: {
    filename: 'CONSTRAINTS.md',
    template: 'examples/constraints.md',
    required: 'MUST/MUST NOT language, forbidden actions, domain-specific rules',
    defaultSources: ['package.json'],
  },
};

const SECTION_BY_SUBSYSTEM: Record<Subsystem, string> = {
  identity: 'agent entry point',
  verification: 'verification section',
  state: 'current state section',
  memory: 'module map',
  constraints: 'hard constraints',
};

const TEMPLATE_SECTION_BY_SUBSYSTEM: Record<Subsystem, string> = {
  identity: 'examples/agents.md → project overview',
  verification: 'examples/agents.md → Verification Commands',
  state: 'examples/progress.md → Current State',
  memory: 'examples/architecture.md → module map',
  constraints: 'examples/constraints.md → MUST / MUST NOT rules',
};

function makeGenerateItem(subsystem: Subsystem, sourceFiles: string[]): RemediationItem {
  const def = ARTIFACT_BY_SUBSYSTEM[subsystem];
  return {
    filename: def.filename,
    subsystem,
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

function buildImproveItem(subsystem: Subsystem, data: SubsystemScore): ImproveItem {
  const def = ARTIFACT_BY_SUBSYSTEM[subsystem];
  const filename = data.files[0] ?? def.filename;
  const missing = data.gaps[0] ?? 'score below threshold';
  return {
    filename,
    subsystem,
    template: def.template,
    required_sections: def.required.split(', '),
    source_signals: def.defaultSources,
    max_lines: MAX_LINES,
    score: data.score,
    findings: data.findings.map((f) => `${f.type}: ${f.message}`),
    why: `Existing ${SECTION_BY_SUBSYSTEM[subsystem]} scored ${data.score}/100.`,
    use_as_sources: [...data.files],
    write_policy: [
      'preserve existing useful content',
      'do not overwrite without --force',
      `keep artifact under ${MAX_LINES} lines`,
    ],
    section: SECTION_BY_SUBSYSTEM[subsystem],
    missing,
    fix: `Update ${SECTION_BY_SUBSYSTEM[subsystem]} using ${def.template}; keep the artifact under ${MAX_LINES} lines.`,
    template_section: TEMPLATE_SECTION_BY_SUBSYSTEM[subsystem],
  };
}

export function buildRemediationPlan(scored: ScoredResult, target: string): RemediationPlan {
  const generate: RemediationItem[] = [];
  const improve: ImproveItem[] = [];
  const source_context: ManualReviewItem[] = [];

  for (const subsystem of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
    const data = scored[subsystem];

    if (data.files.length === 0) {
      generate.push(makeGenerateItem(subsystem, ARTIFACT_BY_SUBSYSTEM[subsystem].defaultSources));
      continue;
    }

    if (data.score < 60) {
      const canonical = data.files.filter((f) => CANONICAL_NAMES.has(f) && !isPlanFile(f));
      const nonCanonical = data.files.filter((f) => !CANONICAL_NAMES.has(f) && !isPlanFile(f));
      const planFiles = data.files.filter((f) => isPlanFile(f));

      if (canonical.length > 0) {
        improve.push(buildImproveItem(subsystem, { ...data, files: canonical }));
      } else if (nonCanonical.length > 0) {
        generate.push(makeGenerateItem(subsystem, [...nonCanonical, 'package.json']));
      }

      for (const file of [...nonCanonical, ...planFiles]) {
        source_context.push({
          path: file,
          subsystem,
          score: data.score,
          reason: 'Useful context was found outside a canonical harness artifact.',
          suggestion: `Use as source context only. Extract durable facts into ${ARTIFACT_BY_SUBSYSTEM[subsystem].filename}.`,
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
    source_context,
  };
}

export function renderRemediationMarkdown(plan: RemediationPlan): string {
  const lines: string[] = [];
  lines.push('# AIReady Plan');
  lines.push(`Generated: ${plan.generated_at}`);
  lines.push(`Target: ${plan.target}`);
  lines.push(`Overall: ${plan.overall}/100`);
  lines.push('');

  lines.push('## GENERATE');
  if (plan.generate.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.generate) {
      lines.push(`### ${item.filename}`);
      lines.push(`- subsystem: ${item.subsystem}`);
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
      lines.push(`- subsystem: ${item.subsystem}`);
      lines.push(`- section: ${item.section}`);
      lines.push(`- missing: ${item.missing}`);
      lines.push(`- fix: ${item.fix}`);
      const srcFiles = item.use_as_sources ?? [];
      if (srcFiles.length > 0) lines.push(`- source_files: ${srcFiles.join(', ')}`);
      lines.push('');
    }
  }
  lines.push('');

  lines.push('## SOURCE CONTEXT');
  if (plan.source_context.length === 0) {
    lines.push('(none)');
  } else {
    for (const item of plan.source_context) {
      lines.push(`### ${item.path}`);
      lines.push(`- subsystem: ${item.subsystem}`);
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

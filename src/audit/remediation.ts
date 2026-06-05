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
  review_manually: ManualReviewItem[];
}

const MAX_LINES = 300;

const GENERATE_ITEMS: Record<Subsystem, RemediationItem> = {
  identity: {
    filename: 'AGENTS.md',
    subsystem: 'identity',
    template: 'examples/agents.md',
    required_sections: [
      'project description',
      'stack with versions',
      'verification commands',
      'repo structure',
      'session protocol',
      'constraints reference',
    ],
    source_signals: ['README.md', 'package.json', 'src/ directory structure'],
    max_lines: MAX_LINES,
  },
  verification: {
    filename: 'scripts/verify.sh + Makefile',
    subsystem: 'verification',
    template: 'examples/scripts/verify.sh + examples/Makefile',
    required_sections: [
      'runnable build/test/lint commands',
      'single canonical verification path',
      'definition of done',
    ],
    source_signals: ['package.json scripts', 'build config', 'test config'],
    max_lines: MAX_LINES,
  },
  state: {
    filename: 'PROGRESS.md + SESSION-HANDOFF.md',
    subsystem: 'state',
    template: 'examples/progress.md + examples/session-handoff.md',
    required_sections: [
      'current build status',
      'completed/in-progress/blocked tasks',
      'next best step',
    ],
    source_signals: ['git log --oneline -20', 'existing task files', 'recent commits'],
    max_lines: MAX_LINES,
  },
  memory: {
    filename: 'ARCHITECTURE.md',
    subsystem: 'memory',
    template: 'examples/architecture.md',
    required_sections: [
      'module map',
      'module responsibilities',
      'key files',
      'data flow',
      'dependency relationships',
    ],
    source_signals: ['src/ directory structure', 'existing docs', 'imports and module boundaries'],
    max_lines: MAX_LINES,
  },
  constraints: {
    filename: 'CONSTRAINTS.md',
    subsystem: 'constraints',
    template: 'examples/constraints.md',
    required_sections: [
      'MUST/MUST NOT language',
      'forbidden actions',
      'domain-specific rules',
    ],
    source_signals: ['codebase patterns', 'auth setup', 'filesystem access patterns'],
    max_lines: MAX_LINES,
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

const CANONICAL_BY_SUBSYSTEM: Record<Subsystem, RegExp> = {
  identity: /^(AGENTS|CLAUDE|AGENT)\.md$|^\.cursorrules$|^\.windsurfrules$|^\.github\/copilot-instructions\.md$/i,
  verification: /^(AGENTS|CLAUDE|Makefile)\.md$|^scripts\/verify\.sh$|^Makefile$/i,
  state: /^(PROGRESS|STATUS|TODO|SESSION-HANDOFF|HANDOFF)\.md$/i,
  memory: /^(ARCHITECTURE|STRUCTURE)\.md$/i,
  constraints: /^(CONSTRAINTS|RULES|AGENTS|CLAUDE)\.md$|^\.cursorrules$|^\.windsurfrules$/i,
};

function cloneGenerateItem(subsystem: Subsystem): RemediationItem {
  const item = GENERATE_ITEMS[subsystem];
  return {
    ...item,
    required_sections: [...item.required_sections],
    source_signals: [...item.source_signals],
  };
}

function firstMissing(data: SubsystemScore): string {
  return data.gaps[0] ?? 'score below threshold for this subsystem';
}

function buildImproveItem(subsystem: Subsystem, data: SubsystemScore): ImproveItem {
  const base = cloneGenerateItem(subsystem);
  const filename = data.files[0] ?? base.filename;
  const missing = firstMissing(data);
  return {
    ...base,
    filename,
    score: data.score,
    findings: data.findings.map((f) => `${f.type}: ${f.message}`),
    section: SECTION_BY_SUBSYSTEM[subsystem],
    missing,
    fix: `Update ${SECTION_BY_SUBSYSTEM[subsystem]} using ${base.template}; keep the artifact under ${MAX_LINES} lines.`,
    template_section: TEMPLATE_SECTION_BY_SUBSYSTEM[subsystem],
  };
}

function buildManualReviewItems(subsystem: Subsystem, data: SubsystemScore): ManualReviewItem[] {
  if (data.score >= 60) return [];
  return data.files
    .filter((file) => !CANONICAL_BY_SUBSYSTEM[subsystem].test(file))
    .map((path) => ({
      path,
      subsystem,
      score: data.score,
      reason: 'Useful content was found outside a canonical harness artifact.',
      suggestion: `Review manually; merge durable harness details into ${GENERATE_ITEMS[subsystem].filename} and do not delete this file automatically.`,
    }));
}

export function buildRemediationPlan(scored: ScoredResult, target: string): RemediationPlan {
  const generate: RemediationItem[] = [];
  const improve: ImproveItem[] = [];
  const review_manually: ManualReviewItem[] = [];

  for (const subsystem of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
    const data = scored[subsystem];
    if (data.files.length === 0) {
      generate.push(cloneGenerateItem(subsystem));
    } else if (data.score < 60) {
      improve.push(buildImproveItem(subsystem, data));
      review_manually.push(...buildManualReviewItems(subsystem, data));
    }
  }

  return {
    generated_at: new Date().toISOString(),
    target,
    overall: scored.overall,
    generate,
    improve,
    review_manually,
  };
}

function list(values: string[]): string {
  return values.join(', ');
}

export function renderRemediationMarkdown(plan: RemediationPlan): string {
  const lines: string[] = [];
  lines.push('# AIReady Plan');
  lines.push(`Generated: ${plan.generated_at}`);
  lines.push(`Target: ${plan.target}`);
  lines.push(`Overall: ${plan.overall}/100`);
  lines.push('');
  lines.push('## Summary');
  lines.push(`- Missing: ${plan.generate.map((i) => i.filename).join(', ') || 'none'}`);
  lines.push(`- Weak: ${plan.improve.map((i) => i.filename).join(', ') || 'none'}`);
  lines.push(`- Manual review: ${plan.review_manually.map((i) => i.path).join(', ') || 'none'}`);
  lines.push('');

  if (plan.generate.length > 0) {
    lines.push('## Generate');
    for (const item of plan.generate) {
      lines.push(`### ${item.filename}`);
      lines.push(`- template: ${item.template}`);
      lines.push(`- subsystem: ${item.subsystem}`);
      lines.push(`- max_lines: ${item.max_lines}`);
      lines.push(`- required_sections: ${list(item.required_sections)}`);
      lines.push(`- source_signals: ${list(item.source_signals)}`);
      lines.push('');
    }
  }

  if (plan.improve.length > 0) {
    lines.push('## Improve');
    for (const item of plan.improve) {
      lines.push(`### ${item.filename} → ${item.section}`);
      lines.push(`- score: ${item.score ?? 0}`);
      lines.push(`- max_lines: ${item.max_lines}`);
      lines.push(`- missing: ${item.missing}`);
      lines.push(`- fix: ${item.fix}`);
      lines.push(`- template_section: ${item.template_section}`);
      if (item.findings && item.findings.length > 0) {
        lines.push(`- findings: ${list(item.findings)}`);
      }
      lines.push('');
    }
  }

  if (plan.review_manually.length > 0) {
    lines.push('## Review Manually');
    for (const item of plan.review_manually) {
      lines.push(`### ${item.path}`);
      lines.push(`- subsystem: ${item.subsystem}`);
      lines.push(`- score: ${item.score}`);
      lines.push(`- reason: ${item.reason}`);
      lines.push(`- suggestion: ${item.suggestion}`);
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

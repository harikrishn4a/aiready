import type { ScoredResult, SubsystemScore } from './scorer.js';
import type { RemediationPlan } from './remediation.js';

export interface ReportOptions {
  json: boolean;
  tokenUsage?: number;
  remediation?: RemediationPlan;
  planPath?: string;
}

function bar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function abbreviateFiles(files: string[]): string {
  if (files.length === 0) return '(no files)';
  const names = files.map((p) => p.split('/').pop() ?? p);
  if (names.length <= 3) return names.join(', ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2} more`;
}

function subsystemLines(name: string, sub: SubsystemScore): string[] {
  const scoreStr = String(sub.score).padStart(3);
  const summary = sub.gaps.length > 0 ? sub.gaps[0] : 'All checks passed';
  const lines: string[] = [
    `${name.padEnd(14)} ${scoreStr}  ${bar(sub.score)}`,
    `  Files: ${abbreviateFiles(sub.files)}`,
  ];

  const present = sub.presentSections?.length ?? 0;
  const missing = sub.missingSections?.length ?? 0;
  if (present + missing > 0) {
    const missingNames = sub.missingSections?.slice(0, 3) ?? [];
    const missingPart = missing > 0
      ? ` — missing: ${missingNames.join(', ')}${missing > 3 ? '…' : ''}`
      : '';
    lines.push(`  Sections: ${present}/${present + missing}${missingPart}`);
  }

  lines.push(`  Note: ${summary}`);
  return lines;
}

function getRecommendation(scored: ScoredResult): string {
  const subsystems = [
    { name: 'identity', score: scored.identity.score },
    { name: 'verification', score: scored.verification.score },
    { name: 'state', score: scored.state.score },
    { name: 'memory', score: scored.memory.score },
    { name: 'constraints', score: scored.constraints.score },
  ] as const;

  const lowest = subsystems.reduce((a, b) => (a.score <= b.score ? a : b));

  const messages: Record<string, string> = {
    identity: 'Add or expand AGENTS.md so agents understand what this project is.',
    verification: 'Document verification commands so agents can confirm their work is correct.',
    state: 'Add PROGRESS.md and SESSION-HANDOFF.md so agents can resume without starting blind.',
    memory: 'Add ARCHITECTURE.md with module map so agents can navigate without exploring.',
    constraints: 'Add MUST / MUST NOT constraints so agents know what they must never do.',
  };

  if (lowest.score >= 80) {
    return 'Repository is well-harnessed. Run `npx aiready audit` regularly to catch drift.';
  }

  return messages[lowest.name] ?? 'Run `npx aiready init` to generate missing artifacts.';
}

function collectCriticalGaps(scored: ScoredResult): string[] {
  const gaps: string[] = [];

  for (const key of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
    const sub = scored[key];
    if (sub.score < 50 && sub.gaps.length > 0) {
      gaps.push(sub.gaps[0] as string);
    }
  }

  for (const check of scored.crossRef.checks) {
    if (!check.passed) {
      gaps.push(check.detail);
    }
  }

  return gaps;
}

export function report(scored: ScoredResult, opts: ReportOptions): void {
  if (opts.json) {
    const out = {
      overall: scored.overall,
      ...(opts.tokenUsage !== undefined ? { token_usage: opts.tokenUsage } : {}),
      ...(opts.planPath ? { plan_path: opts.planPath } : {}),
      subsystems: {
        identity: { score: scored.identity.score, gaps: scored.identity.gaps, files: scored.identity.files },
        verification: { score: scored.verification.score, gaps: scored.verification.gaps, files: scored.verification.files },
        state: { score: scored.state.score, gaps: scored.state.gaps, files: scored.state.files },
        memory: { score: scored.memory.score, gaps: scored.memory.gaps, files: scored.memory.files },
        constraints: { score: scored.constraints.score, gaps: scored.constraints.gaps, files: scored.constraints.files },
      },
      ...(opts.remediation ? { remediation: opts.remediation } : {}),
      crossReference: scored.crossRef,
      recommendation: getRecommendation(scored),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const lines: string[] = [];

  lines.push(`AI Readiness: ${scored.overall}/100`);
  lines.push('');
  const subsystemBlocks = [
    subsystemLines('identity', scored.identity),
    subsystemLines('verification', scored.verification),
    subsystemLines('state', scored.state),
    subsystemLines('memory', scored.memory),
    subsystemLines('constraints', scored.constraints),
  ];
  for (const [idx, block] of subsystemBlocks.entries()) {
    if (idx > 0) lines.push('');
    lines.push(...block);
  }

  const criticalGaps = collectCriticalGaps(scored);
  if (criticalGaps.length > 0) {
    lines.push('');
    lines.push('Critical gaps:');
    for (const gap of criticalGaps) {
      lines.push(`  ✗ ${gap}`);
    }
  }

  lines.push('');
  if (opts.remediation && opts.remediation.generate.length === 0 && opts.remediation.improve.length === 0) {
    lines.push('No remediation needed. Run `npx aiready drift` to monitor for future gaps.');
  } else {
    lines.push(getRecommendation(scored));
    if (opts.planPath) {
      lines.push(`Plan written: ${opts.planPath}`);
      lines.push('Next: `npx aiready init --target .`');
    }
  }

  process.stdout.write(lines.join('\n') + '\n');
}

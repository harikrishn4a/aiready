import type { ScoredResult } from './scorer.js';

export interface ReportOptions {
  json: boolean;
  tokenUsage?: number;
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

function subsystemLine(name: string, score: number, gaps: string[], files: string[]): string {
  const scoreStr = String(score).padStart(3);
  const filePart = abbreviateFiles(files).padEnd(30);
  const summary = gaps.length > 0 ? gaps[0] : 'All checks passed';
  return `${name.padEnd(14)}  ${bar(score)}  ${scoreStr}   ${filePart}  ${summary}`;
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
      subsystems: {
        identity: { score: scored.identity.score, gaps: scored.identity.gaps, files: scored.identity.files },
        verification: { score: scored.verification.score, gaps: scored.verification.gaps, files: scored.verification.files },
        state: { score: scored.state.score, gaps: scored.state.gaps, files: scored.state.files },
        memory: { score: scored.memory.score, gaps: scored.memory.gaps, files: scored.memory.files },
        constraints: { score: scored.constraints.score, gaps: scored.constraints.gaps, files: scored.constraints.files },
      },
      crossReference: scored.crossRef,
      recommendation: getRecommendation(scored),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const lines: string[] = [];

  lines.push(`AI Readiness: ${scored.overall}/100`);
  lines.push('');
  lines.push(subsystemLine('identity', scored.identity.score, scored.identity.gaps, scored.identity.files));
  lines.push(subsystemLine('verification', scored.verification.score, scored.verification.gaps, scored.verification.files));
  lines.push(subsystemLine('state', scored.state.score, scored.state.gaps, scored.state.files));
  lines.push(subsystemLine('memory', scored.memory.score, scored.memory.gaps, scored.memory.files));
  lines.push(subsystemLine('constraints', scored.constraints.score, scored.constraints.gaps, scored.constraints.files));

  const criticalGaps = collectCriticalGaps(scored);
  if (criticalGaps.length > 0) {
    lines.push('');
    lines.push('Critical gaps:');
    for (const gap of criticalGaps) {
      lines.push(`  ✗ ${gap}`);
    }
  }

  lines.push('');
  lines.push(getRecommendation(scored));

  process.stdout.write(lines.join('\n') + '\n');
}

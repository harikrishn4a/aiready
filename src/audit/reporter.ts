import type { ScoredResult } from './scorer.js';
import type { CrossRefResult } from './cross-ref.js';

export interface ReportOptions {
  json: boolean;
}

function bar(score: number): string {
  const filled = Math.round(score / 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}

function subsystemLine(name: string, score: number, gaps: string[]): string {
  const scoreStr = String(score).padStart(3);
  const summary = gaps.length > 0 ? gaps[0] : 'All checks passed';
  return `${name.padEnd(14)}  ${bar(score)}  ${scoreStr}   ${summary}`;
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

function collectCriticalGaps(scored: ScoredResult, xref: CrossRefResult): string[] {
  const gaps: string[] = [];

  for (const [, value] of Object.entries(scored)) {
    if (typeof value === 'object' && 'score' in value && 'gaps' in value) {
      const sub = value as { score: number; gaps: string[] };
      if (sub.score < 50) {
        gaps.push(...sub.gaps.slice(0, 1));
      }
    }
  }

  for (const check of xref.checks) {
    if (!check.passed) {
      gaps.push(check.detail);
    }
  }

  return gaps;
}

export function report(
  scored: ScoredResult,
  xref: CrossRefResult,
  opts: ReportOptions,
): void {
  if (opts.json) {
    const out = {
      overall: scored.overall,
      subsystems: {
        identity: scored.identity,
        verification: scored.verification,
        state: scored.state,
        memory: scored.memory,
        constraints: scored.constraints,
      },
      crossReference: xref,
      recommendation: getRecommendation(scored),
    };
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
    return;
  }

  const lines: string[] = [];

  lines.push(`AI Readiness: ${scored.overall}/100`);
  lines.push('');
  lines.push(subsystemLine('identity', scored.identity.score, scored.identity.gaps));
  lines.push(subsystemLine('verification', scored.verification.score, scored.verification.gaps));
  lines.push(subsystemLine('state', scored.state.score, scored.state.gaps));
  lines.push(subsystemLine('memory', scored.memory.score, scored.memory.gaps));
  lines.push(subsystemLine('constraints', scored.constraints.score, scored.constraints.gaps));

  const criticalGaps = collectCriticalGaps(scored, xref);
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

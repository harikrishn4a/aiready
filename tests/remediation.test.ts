import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import {
  buildRemediationPlan,
  renderRemediationMarkdown,
  writeRemediationPlan,
} from '../src/audit/remediation';
import type { ScoredResult, SubsystemScore } from '../src/audit/scorer';

function sub(score: number, files: string[] = [], gaps: string[] = []): SubsystemScore {
  return {
    score,
    files,
    gaps,
    findings: gaps.map((message) => ({ type: 'fail' as const, message })),
  };
}

function scored(overrides: Partial<ScoredResult> = {}): ScoredResult {
  return {
    identity: sub(90, ['AGENTS.md']),
    verification: sub(90, ['AGENTS.md']),
    state: sub(90, ['PROGRESS.md']),
    memory: sub(90, ['ARCHITECTURE.md']),
    constraints: sub(90, ['CONSTRAINTS.md']),
    overall: 90,
    crossRef: { checks: [] },
    ...overrides,
  };
}

describe('buildRemediationPlan', () => {
  it('adds generate items when no files are mapped', () => {
    const plan = buildRemediationPlan(
      scored({ constraints: sub(0, [], ['No constraints file mapped']) }),
      '/repo',
    );
    expect(plan.generate.map((i) => i.filename)).toContain('CONSTRAINTS.md');
    expect(plan.generate[0]?.max_lines).toBe(300);
  });

  it('adds improve items when files exist but score is low', () => {
    const plan = buildRemediationPlan(
      scored({ verification: sub(45, ['CLAUDE.md'], ['runnable commands missing']) }),
      '/repo',
    );
    expect(plan.improve[0]).toMatchObject({
      filename: 'CLAUDE.md',
      subsystem: 'verification',
      max_lines: 300,
    });
    expect(plan.improve[0]?.template_section).toContain('examples/agents.md');
  });

  it('adds source context for weak non-canonical files', () => {
    const plan = buildRemediationPlan(
      scored({ state: sub(35, ['FEATURE_PLAN.md'], ['no current status']) }),
      '/repo',
    );
    expect(plan.source_context[0]).toMatchObject({
      path: 'FEATURE_PLAN.md',
      subsystem: 'state',
    });
  });
});

describe('renderRemediationMarkdown', () => {
  it('includes template references and max_lines', () => {
    const plan = buildRemediationPlan(
      scored({ identity: sub(0, [], ['missing entry point']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('# AIReady Plan');
    expect(md).toContain('template: examples/agents.md');
    expect(md).toContain('max_lines: 300');
    expect(md).toContain('## Missing Artifacts');
  });
});

describe('writeRemediationPlan', () => {
  it('writes .aiready/plan.md under target', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-plan-'));
    try {
      const plan = buildRemediationPlan(scored(), dir);
      const planPath = writeRemediationPlan(dir, plan);
      expect(planPath.endsWith(join('.aiready', 'plan.md'))).toBe(true);
      expect(readFileSync(planPath, 'utf8')).toContain('# AIReady Plan');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

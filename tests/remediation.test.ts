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

  it('adds improve items when canonical file exists but score is low', () => {
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

  it('canonical file with low score goes to IMPROVE not GENERATE', () => {
    const plan = buildRemediationPlan(
      scored({ constraints: sub(45, ['CLAUDE.md'], ['constraints present but not structured']) }),
      '/repo',
    );
    expect(plan.generate.map((item) => item.subsystem)).not.toContain('constraints');
    expect(plan.improve[0]).toMatchObject({
      filename: 'CLAUDE.md',
      subsystem: 'constraints',
      missing: 'constraints present but not structured',
    });
  });

  it.each([
    ['identity' as const, 'README.md', 'AGENTS.md'],
    ['verification' as const, 'PLAN.md', 'AGENTS.md'],
    ['state' as const, 'CHECKPOINT.md', 'PROGRESS.md'],
    ['memory' as const, 'DESIGN.md', 'ARCHITECTURE.md'],
  ])('non-canonical %s file → generates canonical artifact', (subsystem, nonCanonical, canonical) => {
    const plan = buildRemediationPlan(
      scored({ [subsystem]: sub(45, [nonCanonical], ['content found but not structured']) }),
      '/repo',
    );
    expect(plan.generate.some((i) => i.filename === canonical)).toBe(true);
    expect(plan.improve.map((i) => i.filename)).not.toContain(nonCanonical);
    expect(plan.source_context.some((i) => i.path === nonCanonical)).toBe(true);
  });

  it('plan.md never appears in generate or improve', () => {
    const plan = buildRemediationPlan(
      scored({ state: sub(20, ['plan.md', '.aiready/plan.md'], ['no progress info']) }),
      '/repo',
    );
    const allTargets = [
      ...plan.generate.map((i) => i.filename),
      ...plan.improve.map((i) => i.filename),
    ];
    expect(allTargets).not.toContain('plan.md');
    expect(allTargets).not.toContain('.aiready/plan.md');
  });

  it('plan.md goes to source context when mapped', () => {
    const plan = buildRemediationPlan(
      scored({ state: sub(20, ['plan.md'], ['no canonical state file']) }),
      '/repo',
    );
    // plan.md is non-canonical AND is a plan file — source context gets it
    expect(plan.source_context.some((i) => i.path === 'plan.md')).toBe(true);
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
  it('writes GENERATE section with new format', () => {
    const plan = buildRemediationPlan(
      scored({ identity: sub(0, [], ['missing entry point']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('# AIReady Plan');
    expect(md).toContain('## GENERATE');
    expect(md).toContain('- template: examples/agents.md');
    expect(md).toContain('- required:');
    expect(md).not.toContain('## Missing Artifacts');
  });

  it('writes IMPROVE section with new format', () => {
    const plan = buildRemediationPlan(
      scored({ identity: sub(40, ['CLAUDE.md'], ['too short']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('## IMPROVE');
    expect(md).toContain('### CLAUDE.md');
    expect(md).toContain('- section:');
    expect(md).toContain('- missing:');
    expect(md).toContain('- fix:');
    expect(md).not.toContain('## Weak Artifacts');
  });

  it('writes SOURCE CONTEXT section', () => {
    const plan = buildRemediationPlan(
      scored({ state: sub(35, ['FEATURE_PLAN.md'], ['no status']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('## SOURCE CONTEXT');
    expect(md).toContain('### FEATURE_PLAN.md');
  });

  it('writes (none) when section is empty', () => {
    const plan = buildRemediationPlan(scored(), '/repo');
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('(none)');
  });

  it('never puts plan.md in GENERATE or IMPROVE', () => {
    const plan = buildRemediationPlan(
      scored({ state: sub(20, ['plan.md'], ['no progress']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    const generateSection = md.split('## GENERATE')[1]?.split('## IMPROVE')[0] ?? '';
    const improveSection = md.split('## IMPROVE')[1]?.split('## SOURCE CONTEXT')[0] ?? '';
    expect(generateSection).not.toContain('### plan.md');
    expect(improveSection).not.toContain('### plan.md');
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

import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
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
  it('adds generate items when no files are mapped', async () => {
    const plan = await buildRemediationPlan(
      scored({ constraints: sub(0, [], ['No constraints file mapped']) }),
      '/repo',
    );
    expect(plan.generate.map((i) => i.filename)).toContain('CONSTRAINTS.md');
    expect(plan.generate.find((i) => i.filename === 'CONSTRAINTS.md')?.max_lines).toBe(300);
  });

  it('adds improve items when canonical file exists but score is low', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents');
      const plan = await buildRemediationPlan(
        scored({ identity: sub(45, ['AGENTS.md'], ['missing stack info']) }),
        dir,
      );
      const item = plan.improve.find((i) => i.filename === 'AGENTS.md');
      expect(item).toBeDefined();
      expect(item).toMatchObject({ subsystem: 'identity', max_lines: 300 });
      expect(item?.template_section).toContain('examples/agents.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('canonical file with low score goes to IMPROVE not GENERATE', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'CONSTRAINTS.md'), '# Constraints');
      const plan = await buildRemediationPlan(
        scored({ constraints: sub(45, ['CONSTRAINTS.md'], ['constraints present but not structured']) }),
        dir,
      );
      expect(plan.generate.map((item) => item.filename)).not.toContain('CONSTRAINTS.md');
      expect(plan.improve.find((i) => i.filename === 'CONSTRAINTS.md')).toMatchObject({
        subsystem: 'constraints',
        missing: 'constraints present but not structured',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each([
    ['identity' as const, 'README.md', 'AGENTS.md'],
    ['verification' as const, 'PLAN.md', 'Makefile'],
    ['state' as const, 'CHECKPOINT.md', 'PROGRESS.md'],
    ['memory' as const, 'DESIGN.md', 'ARCHITECTURE.md'],
  ])('non-canonical %s file → generates canonical artifact', async (subsystem, nonCanonical, canonical) => {
    const plan = await buildRemediationPlan(
      scored({ [subsystem]: sub(45, [nonCanonical], ['content found but not structured']) }),
      '/repo',
    );
    expect(plan.generate.some((i) => i.filename === canonical)).toBe(true);
    expect(plan.improve.map((i) => i.filename)).not.toContain(nonCanonical);
    expect(plan.source_context.some((i) => i.path === nonCanonical)).toBe(true);
  });

  it('plan.md never appears in generate or improve', async () => {
    const plan = await buildRemediationPlan(
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

  it('plan.md goes to source context when mapped', async () => {
    const plan = await buildRemediationPlan(
      scored({ state: sub(20, ['plan.md'], ['no canonical state file']) }),
      '/repo',
    );
    expect(plan.source_context.some((i) => i.path === 'plan.md')).toBe(true);
  });

  it('adds source context for weak non-canonical files', async () => {
    const plan = await buildRemediationPlan(
      scored({ state: sub(35, ['FEATURE_PLAN.md'], ['no current status']) }),
      '/repo',
    );
    expect(plan.source_context[0]).toMatchObject({
      path: 'FEATURE_PLAN.md',
      subsystem: 'state',
    });
  });

  it('canonical file with score >= 80 goes to skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents');
      const plan = await buildRemediationPlan(
        scored({ identity: sub(85, ['AGENTS.md']) }),
        dir,
      );
      expect(plan.skip.some((i) => i.filename === 'AGENTS.md')).toBe(true);
      expect(plan.generate.map((i) => i.filename)).not.toContain('AGENTS.md');
      expect(plan.improve.map((i) => i.filename)).not.toContain('AGENTS.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('all 13 canonical artifacts appear across generate/improve/skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents');
      const plan = await buildRemediationPlan(scored({ identity: sub(45, ['AGENTS.md']) }), dir);
      const all = [
        ...plan.generate.map((i) => i.filename),
        ...plan.improve.map((i) => i.filename),
        ...plan.skip.map((i) => i.filename),
      ];
      const expected = [
        'AGENTS.md', 'CONSTRAINTS.md', 'ARCHITECTURE.md', 'DECISIONS.md',
        'PROGRESS.md', 'SESSION-HANDOFF.md', 'TASK.md', 'features.md',
        'feature_list.json', 'QUALITY.md', 'Makefile', 'scripts/init.sh', 'scripts/verify.sh',
      ];
      for (const name of expected) {
        expect(all).toContain(name);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('renderRemediationMarkdown', () => {
  it('writes GENERATE section with new format', async () => {
    const plan = await buildRemediationPlan(
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

  it('writes IMPROVE section with new format', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents');
      const plan = await buildRemediationPlan(
        scored({ identity: sub(40, ['AGENTS.md'], ['too short']) }),
        dir,
      );
      const md = renderRemediationMarkdown(plan);
      expect(md).toContain('## IMPROVE');
      expect(md).toContain('### AGENTS.md');
      expect(md).toContain('- section:');
      expect(md).toContain('- missing:');
      expect(md).toContain('- fix:');
      expect(md).not.toContain('## Weak Artifacts');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes SKIP section', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents');
      const plan = await buildRemediationPlan(
        scored({ identity: sub(85, ['AGENTS.md']) }),
        dir,
      );
      const md = renderRemediationMarkdown(plan);
      expect(md).toContain('## SKIP');
      expect(md).toContain('AGENTS.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('writes SOURCE CONTEXT section', async () => {
    const plan = await buildRemediationPlan(
      scored({ state: sub(35, ['FEATURE_PLAN.md'], ['no status']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('## SOURCE CONTEXT');
    expect(md).toContain('### FEATURE_PLAN.md');
  });

  it('writes (none) when improve and skip sections are empty', async () => {
    const plan = await buildRemediationPlan(scored(), '/repo');
    const md = renderRemediationMarkdown(plan);
    expect(md).toContain('(none)');
  });

  it('never puts plan.md in GENERATE or IMPROVE', async () => {
    const plan = await buildRemediationPlan(
      scored({ state: sub(20, ['plan.md'], ['no progress']) }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    const generateSection = md.split('## GENERATE')[1]?.split('## IMPROVE')[0] ?? '';
    const improveSection = md.split('## IMPROVE')[1]?.split('## SKIP')[0] ?? '';
    expect(generateSection).not.toContain('### plan.md');
    expect(improveSection).not.toContain('### plan.md');
  });
});

describe('writeRemediationPlan', () => {
  it('writes .aiready/plan.md under target', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-plan-'));
    try {
      const plan = await buildRemediationPlan(scored(), dir);
      const planPath = writeRemediationPlan(dir, plan);
      expect(planPath.endsWith(join('.aiready', 'plan.md'))).toBe(true);
      expect(readFileSync(planPath, 'utf8')).toContain('# AIReady Plan');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

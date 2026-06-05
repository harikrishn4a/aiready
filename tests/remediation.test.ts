import { describe, it, expect } from 'vitest';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import {
  buildRemediationPlan,
  renderRemediationMarkdown,
  writeRemediationPlan,
  CANONICAL_ARTIFACTS,
  SOURCE_ONLY_FILES,
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

  it('deduplicates source context by path and combines subsystems', async () => {
    const plan = await buildRemediationPlan(
      scored({
        identity: sub(20, ['plan.md'], ['identity context is not canonical']),
        state: sub(20, ['plan.md'], ['state context is not canonical']),
        memory: sub(20, ['plan.md'], ['memory context is not canonical']),
        constraints: sub(20, ['plan.md'], ['constraints context is not canonical']),
      }),
      '/repo',
    );
    const planEntries = plan.source_context.filter((item) => item.path === 'plan.md');
    expect(planEntries).toHaveLength(1);
    expect(planEntries[0]?.subsystems).toEqual(['identity', 'state', 'memory', 'constraints']);
  });

  it('prefers non-empty source files and excludes empty canonical target as its own source', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'CONSTRAINTS.md'), '');
      writeFileSync(join(dir, 'CLAUDE.md'), '## Key constraints\nMUST NOT modify the existing pipeline.');
      writeFileSync(join(dir, 'plan.md'), '## Plan\nConstraint notes live here.');
      writeFileSync(join(dir, 'AGENTS.md'), '');
      const plan = await buildRemediationPlan(
        scored({
          constraints: sub(35, ['CONSTRAINTS.md', 'CLAUDE.md', 'plan.md'], ['constraints are embedded elsewhere']),
        }),
        dir,
      );
      const item = plan.improve.find((i) => i.filename === 'CONSTRAINTS.md');
      expect(item?.use_as_sources).toContain('CLAUDE.md');
      expect(item?.use_as_sources).toContain('plan.md');
      expect(item?.use_as_sources).not.toContain('CONSTRAINTS.md');
      expect(item?.use_as_sources).not.toContain('AGENTS.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps PROGRESS.md and SESSION-HANDOFF.md missing guidance separate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'PROGRESS.md'), '# Progress');
      writeFileSync(join(dir, 'SESSION-HANDOFF.md'), '');
      const plan = await buildRemediationPlan(
        scored({
          state: sub(35, ['PROGRESS.md', 'SESSION-HANDOFF.md'], ['SESSION-HANDOFF.md is empty']),
        }),
        dir,
      );
      const progress = plan.improve.find((i) => i.filename === 'PROGRESS.md');
      const handoff = plan.improve.find((i) => i.filename === 'SESSION-HANDOFF.md');
      expect(progress?.missing).not.toContain('SESSION-HANDOFF.md');
      expect(progress?.fix).toContain("PROGRESS.md's current state section");
      expect(handoff?.missing).toContain('SESSION-HANDOFF.md is empty');
      expect(handoff?.fix).toContain("SESSION-HANDOFF.md's session handoff");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
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

  it('non-generateOnly file always goes to improve regardless of score', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents\n\n## What this is\nA project.');
      const plan = await buildRemediationPlan(
        scored({ identity: sub(85, ['AGENTS.md']) }),
        dir,
      );
      expect(plan.improve.some((i) => i.filename === 'AGENTS.md')).toBe(true);
      expect(plan.skip.map((i) => i.filename)).not.toContain('AGENTS.md');
      expect(plan.generate.map((i) => i.filename)).not.toContain('AGENTS.md');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generateOnly file with content goes to skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'Makefile'), 'setup:\n\tnpm ci\ndev:\n\tnpm run dev\ncheck:\n\tnpm run typecheck\ntest:\n\tnpm test\nlint:\n\tnpm run lint\nclean:\n\trm -rf dist\n');
      const plan = await buildRemediationPlan(scored(), dir);
      expect(plan.skip.some((i) => i.filename === 'Makefile')).toBe(true);
      expect(plan.generate.map((i) => i.filename)).not.toContain('Makefile');
      expect(plan.improve.map((i) => i.filename)).not.toContain('Makefile');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generateOnly file that is empty goes to generate', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'TASK.md'), '');
      const plan = await buildRemediationPlan(scored(), dir);
      expect(plan.generate.some((i) => i.filename === 'TASK.md')).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('all 19 canonical artifacts appear across generate/improve/skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-test-'));
    try {
      writeFileSync(join(dir, 'AGENTS.md'), '# Agents\n\nReal content here for testing.');
      const plan = await buildRemediationPlan(scored({ identity: sub(45, ['AGENTS.md']) }), dir);
      const all = [
        ...plan.generate.map((i) => i.filename),
        ...plan.improve.map((i) => i.filename),
        ...plan.skip.map((i) => i.filename),
      ];
      const expected = [
        'AGENTS.md', 'CONSTRAINTS.md', 'ARCHITECTURE.md', 'DECISIONS.md', 'structure.md',
        'PROGRESS.md', 'SESSION-HANDOFF.md', 'TASK.md', 'features.md',
        'feature_list.json', 'feature-list-schema.json', 'QUALITY.md',
        'quality-document.md', 'evaluator_rubric.md', 'clean-state-checklist.md',
        'startup.md', 'Makefile', 'scripts/init.sh', 'scripts/verify.sh',
      ];
      expect(all).toHaveLength(19);
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
    expect(md).toContain('- subsystems: state');
  });

  it('renders a single SOURCE CONTEXT block for files mapped to multiple subsystems', async () => {
    const plan = await buildRemediationPlan(
      scored({
        identity: sub(20, ['plan.md'], ['identity missing']),
        state: sub(20, ['plan.md'], ['state missing']),
      }),
      '/repo',
    );
    const md = renderRemediationMarkdown(plan);
    expect((md.match(/### plan\.md/g) ?? [])).toHaveLength(1);
    expect(md).toContain('- subsystems: identity, state');
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

describe('CANONICAL_ARTIFACTS', () => {
  it('has exactly 19 entries', () => {
    expect(CANONICAL_ARTIFACTS).toHaveLength(19);
  });

  it('source-only files are never in canonical set', () => {
    const filenames = CANONICAL_ARTIFACTS.map((a) => a.filename);
    for (const f of SOURCE_ONLY_FILES) {
      expect(filenames).not.toContain(f);
    }
  });

  it('Makefile is generateOnly', () => {
    const makefile = CANONICAL_ARTIFACTS.find((a) => a.filename === 'Makefile');
    expect(makefile?.generateOnly).toBe(true);
  });

  it('AGENTS.md is not generateOnly', () => {
    const agents = CANONICAL_ARTIFACTS.find((a) => a.filename === 'AGENTS.md');
    expect(agents?.generateOnly).toBe(false);
  });

  it('scripts/init.sh is generateOnly with null subsystem', () => {
    const initSh = CANONICAL_ARTIFACTS.find((a) => a.filename === 'scripts/init.sh');
    expect(initSh?.generateOnly).toBe(true);
    expect(initSh?.subsystem).toBeNull();
  });

  it('structure.md is not generateOnly', () => {
    const structure = CANONICAL_ARTIFACTS.find((a) => a.filename === 'structure.md');
    expect(structure?.generateOnly).toBe(false);
    expect(structure?.subsystem).toBe('memory');
  });

  it('startup.md is generateOnly with verification subsystem', () => {
    const startup = CANONICAL_ARTIFACTS.find((a) => a.filename === 'startup.md');
    expect(startup?.generateOnly).toBe(true);
    expect(startup?.subsystem).toBe('verification');
  });

  it('all generateOnly artifacts have a template path', () => {
    const generateOnly = CANONICAL_ARTIFACTS.filter((a) => a.generateOnly);
    for (const a of generateOnly) {
      expect(a.template.length).toBeGreaterThan(0);
    }
  });
});

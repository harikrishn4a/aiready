import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { buildInitPlan } from '../src/init/planner';

const FIXTURES = join(__dirname, 'fixtures');
const PLAN_SCORES = join(FIXTURES, 'init', 'plan-with-scores.md');
const PLAN_BETTERWORLD = join(FIXTURES, 'init', 'plan-betterworld.md');
const PARTIAL_REPO = join(FIXTURES, 'repos', 'partial-repo');
const PLAN_MALFORMED = join(FIXTURES, 'init', 'plan-malformed.md');

describe('buildInitPlan', () => {
  it('parses generate and improve from plan — not 13 canonical re-decisions', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const generate = plan.artifacts.filter((a) => a.action === 'generate');
    const improve = plan.artifacts.filter((a) => a.action === 'improve');
    const skip = plan.artifacts.filter((a) => a.action === 'skip');
    expect(generate).toHaveLength(1);
    expect(generate[0].filename).toBe('CONSTRAINTS.md');
    expect(improve).toHaveLength(1);
    expect(improve[0].filename).toBe('PROGRESS.md');
    expect(skip.length).toBeGreaterThan(0);
    expect(skip.some((a) => a.filename === 'AGENTS.md')).toBe(true);
  });

  it('does not generate 12 artifacts when plan GENERATE is one item', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const actionable = plan.artifacts.filter((a) => a.action !== 'skip');
    expect(actionable).toHaveLength(2);
  });

  it('parses overall score from plan', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    expect(plan.overall).toBe(55);
  });

  it('populates subsystemSources from plan', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    expect(plan.subsystemSources['identity']).toContain('AGENTS.md');
    expect(plan.subsystemSources['verification']).toContain('package.json');
  });

  it('uses source_files from plan for improve items', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const progress = plan.artifacts.find((a) => a.filename === 'PROGRESS.md');
    expect(progress!.sourceFiles).toContain('package.json');
  });

  it('parses betterworld plan with GENERATE none and IMPROVE items', async () => {
    const plan = await buildInitPlan(PLAN_BETTERWORLD, PARTIAL_REPO);
    const generate = plan.artifacts.filter((a) => a.action === 'generate');
    const improve = plan.artifacts.filter((a) => a.action === 'improve');
    expect(generate).toHaveLength(0);
    expect(improve.map((a) => a.filename)).toEqual(
      expect.arrayContaining(['CONSTRAINTS.md', 'ARCHITECTURE.md']),
    );
    expect(plan.sourceContext.some((s) => s.path === 'CLAUDE.md')).toBe(true);
  });

  it('throws when plan file does not exist', async () => {
    await expect(buildInitPlan('/nonexistent/plan.md', PARTIAL_REPO)).rejects.toThrow();
  });

  it('throws when plan has no Overall score', async () => {
    await expect(buildInitPlan(PLAN_MALFORMED, PARTIAL_REPO)).rejects.toThrow();
  });

  it('resolves template path for improve items without template in plan', async () => {
    const plan = await buildInitPlan(PLAN_BETTERWORLD, PARTIAL_REPO);
    const constraints = plan.artifacts.find((a) => a.filename === 'CONSTRAINTS.md');
    expect(constraints!.templateFile).toBe('examples/constraints.md');
  });
});

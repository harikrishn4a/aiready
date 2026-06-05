import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { parsePlan } from '../src/init/parser';

const FIXTURES = join(__dirname, 'fixtures', 'init');
const PLAN_FULL = join(FIXTURES, 'plan-full.md');
const PLAN_EMPTY = join(FIXTURES, 'plan-nothing-to-generate.md');
const PLAN_MALFORMED = join(FIXTURES, 'plan-malformed.md');
const PLAN_MISSING = join(FIXTURES, 'plan-does-not-exist.md');

describe('parsePlan', () => {
  it('parses generate and improve items from valid plan', async () => {
    const plan = await parsePlan(PLAN_FULL);
    expect(plan).not.toBeNull();
    expect(plan!.generate).toHaveLength(2);
    expect(plan!.improve).toHaveLength(1);
    expect(plan!.generate[0].filename).toBe('PROGRESS.md');
    expect(plan!.generate[1].filename).toBe('CONSTRAINTS.md');
    expect(plan!.improve[0].filename).toBe('CLAUDE.md');
  });

  it('never returns .aiready/plan.md as a target', async () => {
    const plan = await parsePlan(PLAN_FULL);
    const allTargets = [
      ...plan!.generate.map((i) => i.filename),
      ...plan!.improve.map((i) => i.filename),
    ];
    expect(allTargets).not.toContain('plan.md');
    expect(allTargets).not.toContain('.aiready/plan.md');
  });

  it('returns empty lists when nothing to generate or improve', async () => {
    const plan = await parsePlan(PLAN_EMPTY);
    expect(plan).not.toBeNull();
    expect(plan!.generate).toHaveLength(0);
    expect(plan!.improve).toHaveLength(0);
  });

  it('returns null for malformed plan', async () => {
    const plan = await parsePlan(PLAN_MALFORMED);
    expect(plan).toBeNull();
  });

  it('returns null for non-existent file', async () => {
    expect(await parsePlan(PLAN_MISSING)).toBeNull();
  });

  it('parses generate item fields', async () => {
    const plan = await parsePlan(PLAN_FULL);
    const item = plan!.generate[0];
    expect(item.subsystem).toBe('state');
    expect(item.templateFile).toBe('examples/progress.md');
    expect(item.sourceFiles).toContain('package.json');
    expect(item.required).toContain('current build status');
  });

  it('parses improve item fields', async () => {
    const plan = await parsePlan(PLAN_FULL);
    const item = plan!.improve[0];
    expect(item.section).toBe('verification');
    expect(item.missing).toContain('commands');
    expect(item.fix).toContain('typecheck');
    expect(item.sourceFiles).toContain('package.json');
  });

  it('parses overall score', async () => {
    const plan = await parsePlan(PLAN_FULL);
    expect(plan!.overall).toBe(45);
  });

  it('source_files are split into an array', async () => {
    const plan = await parsePlan(PLAN_FULL);
    expect(Array.isArray(plan!.generate[0].sourceFiles)).toBe(true);
  });
});

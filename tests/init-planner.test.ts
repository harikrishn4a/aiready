import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { buildInitPlan } from '../src/init/planner';

const FIXTURES = join(__dirname, 'fixtures');
const PLAN_SCORES = join(FIXTURES, 'init', 'plan-with-scores.md');
const PARTIAL_REPO = join(FIXTURES, 'repos', 'partial-repo');
const PLAN_MALFORMED = join(FIXTURES, 'init', 'plan-malformed.md');

// partial-repo has: AGENTS.md, PROGRESS.md

describe('buildInitPlan', () => {
  it('throws when plan file does not exist', async () => {
    await expect(buildInitPlan('/nonexistent/plan.md', PARTIAL_REPO)).rejects.toThrow();
  });

  it('throws when plan has no Overall score', async () => {
    await expect(buildInitPlan(PLAN_MALFORMED, PARTIAL_REPO)).rejects.toThrow();
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

  it('produces exactly 19 artifacts (one per canonical artifact)', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    expect(plan.artifacts).toHaveLength(19);
  });

  it('AGENTS.md (exists, !generateOnly) → improve', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const agents = plan.artifacts.find((a) => a.filename === 'AGENTS.md');
    expect(agents?.action).toBe('improve');
  });

  it('PROGRESS.md (exists, !generateOnly) → improve', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const progress = plan.artifacts.find((a) => a.filename === 'PROGRESS.md');
    expect(progress?.action).toBe('improve');
  });

  it('CONSTRAINTS.md (missing, !generateOnly) → generate', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const constraints = plan.artifacts.find((a) => a.filename === 'CONSTRAINTS.md');
    expect(constraints?.action).toBe('generate');
  });

  it('generateOnly artifact (Makefile) missing → generate', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const makefile = plan.artifacts.find((a) => a.filename === 'Makefile');
    expect(makefile?.action).toBe('generate');
    expect(makefile?.generateOnly).toBe(true);
  });

  it('generateOnly artifact that exists with content → skip', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-planner-'));
    const planPath = PLAN_SCORES;
    try {
      writeFileSync(join(dir, 'Makefile'), 'setup:\n\tnpm ci\ndev:\n\tnpm run dev\ncheck:\n\tnpm run typecheck\ntest:\n\tnpm test\nlint:\n\tnpm run lint\nclean:\n\trm -rf dist\n');
      const plan = await buildInitPlan(planPath, dir);
      const makefile = plan.artifacts.find((a) => a.filename === 'Makefile');
      expect(makefile?.action).toBe('skip');
      expect(makefile?.reason).toContain('generate-only');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('generateOnly artifact that exists but is empty → generate with alwaysGenerate=true', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-planner-'));
    const planPath = PLAN_SCORES;
    try {
      writeFileSync(join(dir, 'TASK.md'), '');
      const plan = await buildInitPlan(planPath, dir);
      const task = plan.artifacts.find((a) => a.filename === 'TASK.md');
      expect(task?.action).toBe('generate');
      expect(task?.alwaysGenerate).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('non-generateOnly artifact always improves regardless of plan SKIP section', async () => {
    // plan-with-scores.md has AGENTS.md in SKIP, but new planner ignores that
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const agents = plan.artifacts.find((a) => a.filename === 'AGENTS.md');
    expect(agents?.action).toBe('improve');
  });

  it('templateFile comes from CANONICAL_ARTIFACTS not plan.md template field', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const constraints = plan.artifacts.find((a) => a.filename === 'CONSTRAINTS.md');
    expect(constraints?.templateFile).toBe('examples/constraints.md');
  });

  it('sourceFiles only includes files that exist in target', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    // AGENTS.md exists in partial-repo, so it may appear in sourceFiles for CONSTRAINTS.md
    const constraints = plan.artifacts.find((a) => a.filename === 'CONSTRAINTS.md');
    // sourceFiles should only contain files that actually exist in PARTIAL_REPO
    const filesInRepo = ['AGENTS.md', 'PROGRESS.md'];
    for (const f of constraints?.sourceFiles ?? []) {
      expect(filesInRepo).toContain(f);
    }
  });

  it('scripts/init.sh is generateOnly with null subsystem', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const initSh = plan.artifacts.find((a) => a.filename === 'scripts/init.sh');
    expect(initSh?.generateOnly).toBe(true);
    expect(initSh?.subsystem).toBeNull();
  });

  it('generates scripts in subdirectory when target has scripts/ dir with files', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'aiready-planner-'));
    const planPath = PLAN_SCORES;
    try {
      mkdirSync(join(dir, 'scripts'));
      writeFileSync(join(dir, 'scripts/verify.sh'), '#!/bin/bash\nset -e\nnpm run build\nnpm run typecheck\nnpm run lint\nnpm test\necho "All checks passed."\n');
      const plan = await buildInitPlan(planPath, dir);
      const verifySh = plan.artifacts.find((a) => a.filename === 'scripts/verify.sh');
      expect(verifySh?.action).toBe('skip');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

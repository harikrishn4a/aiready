import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { buildInitPlan } from '../src/init/planner';

const FIXTURES = join(__dirname, 'fixtures');
const PLAN_SCORES = join(FIXTURES, 'init', 'plan-with-scores.md');
const PARTIAL_REPO = join(FIXTURES, 'repos', 'partial-repo');
const PLAN_MALFORMED = join(FIXTURES, 'init', 'plan-malformed.md');

describe('buildInitPlan', () => {
  it('returns all 13 canonical artifacts', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    expect(plan.artifacts).toHaveLength(13);
  });

  it('alwaysGenerate artifacts are never skipped', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const alwaysFiles = ['TASK.md', 'features.md', 'feature_list.json', 'QUALITY.md'];
    for (const filename of alwaysFiles) {
      const artifact = plan.artifacts.find((a) => a.filename === filename);
      expect(artifact).toBeDefined();
      expect(artifact!.action).not.toBe('skip');
    }
  });

  it('artifact with score >= 80 is skipped when file exists', async () => {
    // partial-repo has AGENTS.md; identity score = 90 in plan-with-scores.md
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const agentsMd = plan.artifacts.find((a) => a.filename === 'AGENTS.md');
    expect(agentsMd!.action).toBe('skip');
    expect(agentsMd!.currentScore).toBe(90);
  });

  it('artifact with score < 80 is improved when file exists', async () => {
    // partial-repo has PROGRESS.md; state score = 45 in plan-with-scores.md
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const progress = plan.artifacts.find((a) => a.filename === 'PROGRESS.md');
    expect(progress!.action).toBe('improve');
    expect(progress!.currentScore).toBe(45);
  });

  it('artifact not present in target is generated', async () => {
    // partial-repo has no CONSTRAINTS.md
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const constraints = plan.artifacts.find((a) => a.filename === 'CONSTRAINTS.md');
    expect(constraints!.action).toBe('generate');
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

  it('includes subsystem-mapped source files in artifact sourceFiles', async () => {
    // identity subsystem sources include AGENTS.md
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const agentsMd = plan.artifacts.find((a) => a.filename === 'AGENTS.md');
    // AGENTS.md is a source for identity subsystem
    expect(agentsMd!.sourceFiles).toContain('AGENTS.md');
  });

  it('throws when plan file does not exist', async () => {
    await expect(buildInitPlan('/nonexistent/plan.md', PARTIAL_REPO)).rejects.toThrow();
  });

  it('throws when plan has no Overall score', async () => {
    await expect(buildInitPlan(PLAN_MALFORMED, PARTIAL_REPO)).rejects.toThrow();
  });

  it('artifact reason explains skip decision', async () => {
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const agentsMd = plan.artifacts.find((a) => a.filename === 'AGENTS.md');
    expect(agentsMd!.reason).toContain('90');
  });

  it('SESSION-HANDOFF.md is improved when PROGRESS.md same subsystem has low score', async () => {
    // state score=45; PROGRESS.md exists → improve; SESSION-HANDOFF.md does not exist → generate
    const plan = await buildInitPlan(PLAN_SCORES, PARTIAL_REPO);
    const handoff = plan.artifacts.find((a) => a.filename === 'SESSION-HANDOFF.md');
    expect(handoff!.action).toBe('generate');
  });
});

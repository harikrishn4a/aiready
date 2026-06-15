import { describe, it, expect } from 'vitest';
import { collectNoiseCandidates } from '../src/init/index';
import type { InitPlan, ArtifactPlan } from '../src/init/planner';

function artifact(sourceFiles: string[]): ArtifactPlan {
  return {
    filename: 'AGENTS.md', outputPath: 'AGENTS.md', action: 'improve', subsystem: 'identity',
    templateFile: 'examples/agents.md', sourceFiles, currentScore: 0, reason: '',
    alwaysGenerate: false, generateOnly: false,
  };
}

function plan(sourceFiles: string[]): InitPlan {
  return { overall: 0, target: '/repo', artifacts: [artifact(sourceFiles)], subsystemSources: {}, sourceContext: [] };
}

describe('collectNoiseCandidates', () => {
  it('never suggests deleting config / manifest / CI / build files', () => {
    const candidates = collectNoiseCandidates(plan([
      'Dockerfile', 'requirements.txt', 'package.json', 'pytest.ini', 'bandit.yaml',
      'codecov.yml', '.github/workflows/test-and-lint.yml', 'Makefile', 'scripts/init.sh',
    ]));
    expect(candidates).toEqual([]);
  });

  it('suggests absorbed markdown docs (changelogs, planning docs)', () => {
    const candidates = collectNoiseCandidates(plan([
      'change_logs/CHECKPOINT_1.md', 'FEATURE_PLAN.md', 'requirements.txt',
    ]));
    expect(candidates).toContain('change_logs/CHECKPOINT_1.md');
    expect(candidates).toContain('FEATURE_PLAN.md');
    expect(candidates).not.toContain('requirements.txt');
  });

  it('never suggests READMEs, canonical artifacts, or entry points', () => {
    const candidates = collectNoiseCandidates(plan([
      'README.md', 'frontend/README.md', 'CLAUDE.md', 'PROGRESS.md',
    ]));
    expect(candidates).toEqual([]);
  });
});

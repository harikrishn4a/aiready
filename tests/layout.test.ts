import { describe, it, expect } from 'vitest';
import { artifactOutputPath, isDocsArtifact, isPlanPath, planFilePath, PLAN_DIR, DOCS_DIR } from '../src/utils/layout';

describe('artifactOutputPath', () => {
  it('keeps AGENTS.md at the repo root', () => {
    expect(artifactOutputPath('AGENTS.md')).toBe('AGENTS.md');
  });

  it('keeps entry-point markdown at the repo root', () => {
    expect(artifactOutputPath('CLAUDE.md')).toBe('CLAUDE.md');
    expect(artifactOutputPath('.github/copilot-instructions.md')).toBe('.github/copilot-instructions.md');
  });

  it('keeps non-markdown build artifacts at the repo root', () => {
    expect(artifactOutputPath('Makefile')).toBe('Makefile');
    expect(artifactOutputPath('feature_list.json')).toBe('feature_list.json');
    expect(artifactOutputPath('scripts/verify.sh')).toBe('scripts/verify.sh');
  });

  it('moves other markdown artifacts under docs/', () => {
    expect(artifactOutputPath('PROGRESS.md')).toBe('docs/PROGRESS.md');
    expect(artifactOutputPath('ARCHITECTURE.md')).toBe('docs/ARCHITECTURE.md');
    expect(artifactOutputPath('CONSTRAINTS.md')).toBe('docs/CONSTRAINTS.md');
    expect(artifactOutputPath('SESSION-HANDOFF.md')).toBe('docs/SESSION-HANDOFF.md');
  });
});

describe('isDocsArtifact', () => {
  it('is true for docs-bound markdown and false for root files', () => {
    expect(isDocsArtifact('PROGRESS.md')).toBe(true);
    expect(isDocsArtifact('AGENTS.md')).toBe(false);
    expect(isDocsArtifact('Makefile')).toBe(false);
  });
});

describe('isPlanPath', () => {
  it('recognises new and legacy plan locations', () => {
    expect(isPlanPath('plan/plan.md')).toBe(true);
    expect(isPlanPath('plan.md')).toBe(true);
    expect(isPlanPath('.aiready/plan.md')).toBe(true);
    expect(isPlanPath('docs/PROGRESS.md')).toBe(false);
  });
});

describe('planFilePath', () => {
  it('points at <target>/plan/plan.md', () => {
    expect(planFilePath('/repo')).toContain(`${PLAN_DIR}/plan.md`);
  });
});

describe('constants', () => {
  it('uses plan/ and docs/', () => {
    expect(PLAN_DIR).toBe('plan');
    expect(DOCS_DIR).toBe('docs');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rankGraphifyFiles } from '../src/utils/graphify';
import {
  sourcesAreThin,
  resolveArtifactSources,
  sourceContextForSubsystem,
} from '../src/init/context';

const GRAPH_FIXTURE = join(__dirname, 'fixtures', 'graphify', 'betterworld-mini.json');

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-init-ctx-'));
  mkdirSync(join(tmp, 'graphify-out'), { recursive: true });
  mkdirSync(join(tmp, 'change_logs'), { recursive: true });
  mkdirSync(join(tmp, 'scripts'), { recursive: true });
  writeFileSync(join(tmp, 'graphify-out', 'graph.json'), readFileSync(GRAPH_FIXTURE, 'utf-8'));
  writeFileSync(join(tmp, 'change_logs', 'CHECKPOINT_1_BACKEND_IMPLEMENTATION.md'), '# Checkpoint\n\nBackend progress documented here with enough content to exceed thin threshold when combined.');
  writeFileSync(join(tmp, 'change_logs', 'WORKFLOW.md'), '# Workflow\n\nState and progress notes.');
  writeFileSync(join(tmp, 'plan.md'), '# Plan\n\nArchitecture module map and constraints for the project.');
  writeFileSync(join(tmp, 'scripts', 'TESTING_GUIDE.md'), '# Testing\n\nVerification test commands and CI workflow.');
  writeFileSync(join(tmp, 'change_logs', 'CRITICAL_FIXES_NEEDED.md'), '# Fixes\n\nMust not modify pipeline. Coding standards.');
  writeFileSync(join(tmp, 'CONSTRAINTS.md'), '');
  writeFileSync(join(tmp, 'CLAUDE.md'), '# Agent\n\nProject overview and stack.');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('rankGraphifyFiles — betterworld fixture', () => {
  it('ranks state documents for state subsystem', () => {
    const graphPath = join(tmp, 'graphify-out', 'graph.json');
    const ranked = rankGraphifyFiles(tmp, graphPath, 'state', 5);
    expect(ranked).toContain('change_logs/CHECKPOINT_1_BACKEND_IMPLEMENTATION.md');
  });

  it('ranks verification documents for verification subsystem', () => {
    const graphPath = join(tmp, 'graphify-out', 'graph.json');
    const ranked = rankGraphifyFiles(tmp, graphPath, 'verification', 5);
    expect(ranked).toContain('scripts/TESTING_GUIDE.md');
  });

  it('ranks constraints documents for constraints subsystem', () => {
    const graphPath = join(tmp, 'graphify-out', 'graph.json');
    const ranked = rankGraphifyFiles(tmp, graphPath, 'constraints', 5);
    expect(ranked.length).toBeGreaterThan(0);
  });
});

describe('resolveArtifactSources', () => {
  it('detects thin sources when only empty canonical file listed', () => {
    expect(sourcesAreThin(tmp, ['CONSTRAINTS.md'])).toBe(true);
  });

  it('expands thin sources from SOURCE CONTEXT and graphify', () => {
    const sourceContext = [
      { path: 'CLAUDE.md', subsystems: ['constraints'] },
      { path: 'plan.md', subsystems: ['constraints'] },
    ];
    const resolved = resolveArtifactSources(
      tmp,
      'constraints',
      ['CONSTRAINTS.md'],
      { constraints: ['CONSTRAINTS.md'] },
      sourceContext,
    );
    expect(resolved.expanded).toBe(true);
    expect(resolved.sourceFiles).toContain('CLAUDE.md');
    expect(resolved.sourceFiles).toContain('plan.md');
    expect(resolved.graphifyContext.length).toBeGreaterThan(0);
  });

  it('always includes graphify context block when graph exists', () => {
    const resolved = resolveArtifactSources(
      tmp,
      'memory',
      ['plan.md'],
      {},
      [],
    );
    expect(resolved.graphifyContext.length).toBeGreaterThan(0);
  });

  it('does not expand when sources are rich', () => {
    writeFileSync(join(tmp, 'rich.md'), 'x'.repeat(600));
    const resolved = resolveArtifactSources(tmp, 'state', ['rich.md'], {}, []);
    expect(resolved.expanded).toBe(false);
    expect(resolved.sourceFiles).toEqual(['rich.md']);
    expect(resolved.graphifyContext.length).toBeGreaterThan(0);
  });
});

describe('sourceContextForSubsystem', () => {
  it('returns paths matching subsystem', () => {
    const paths = sourceContextForSubsystem(
      [{ path: 'CLAUDE.md', subsystems: ['identity', 'constraints'] }],
      'constraints',
    );
    expect(paths).toEqual(['CLAUDE.md']);
  });
});

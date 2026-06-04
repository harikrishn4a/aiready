import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { loadRepo } from '../src/audit/loader';
import { scoreRepo } from '../src/audit/scorer';
import { crossRef } from '../src/audit/cross-ref';

const root = resolve('.');
const goodRepo = join(root, 'test-fixtures', 'good-repo');
const bareRepo = join(root, 'test-fixtures', 'bare-repo');
const cliBin = join(root, 'dist', 'cli.js');

// Strip VITEST from env so the spawned CLI process runs normally
function cliEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env['VITEST'];
  return env;
}

function spawnCli(args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync('node', [cliBin, ...args], { encoding: 'utf8', env: cliEnv() });
}

// ── Pipeline-level integration ──────────────────────────────────────────────

describe('pipeline: good-repo', () => {
  it('loads without errors', () => {
    const files = loadRepo(goodRepo);
    expect(files.agentsMd).not.toBeNull();
    expect(files.architectureMd).not.toBeNull();
    expect(files.progressMd).not.toBeNull();
    expect(files.sessionHandoffMd).not.toBeNull();
    expect(files.packageJson).not.toBeNull();
  });

  it('scores above 70', () => {
    const files = loadRepo(goodRepo);
    const scored = scoreRepo(files);
    expect(scored.overall).toBeGreaterThan(70);
  });

  it('passes all cross-ref checks', () => {
    const files = loadRepo(goodRepo);
    const xref = crossRef(files);
    const failed = xref.checks.filter((c) => !c.passed);
    expect(failed).toHaveLength(0);
  });
});

describe('pipeline: bare-repo', () => {
  it('loads with all harness files null', () => {
    const files = loadRepo(bareRepo);
    expect(files.agentsMd).toBeNull();
    expect(files.architectureMd).toBeNull();
    expect(files.progressMd).toBeNull();
  });

  it('scores below 30', () => {
    const files = loadRepo(bareRepo);
    const scored = scoreRepo(files);
    expect(scored.overall).toBeLessThan(30);
  });

  it('fails all cross-ref checks', () => {
    const files = loadRepo(bareRepo);
    const xref = crossRef(files);
    const failed = xref.checks.filter((c) => !c.passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});

// ── CLI binary integration ───────────────────────────────────────────────────

describe('CLI binary: good-repo', () => {
  it('exits 0 with default --min-score 70', () => {
    expect(spawnCli(['audit', '--target', goodRepo]).status).toBe(0);
  });

  it('output contains AI Readiness line', () => {
    expect(spawnCli(['audit', '--target', goodRepo]).stdout).toContain('AI Readiness:');
  });

  it('output contains all 5 subsystem names', () => {
    const { stdout } = spawnCli(['audit', '--target', goodRepo]);
    expect(stdout).toContain('identity');
    expect(stdout).toContain('verification');
    expect(stdout).toContain('state');
    expect(stdout).toContain('memory');
    expect(stdout).toContain('constraints');
  });

  it('--json outputs valid JSON', () => {
    const result = spawnCli(['audit', '--target', goodRepo, '--json']);
    expect(result.status).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed).toHaveProperty('overall');
    expect(parsed).toHaveProperty('subsystems');
    expect(parsed).toHaveProperty('crossReference');
    expect(parsed).toHaveProperty('recommendation');
  });

  it('--json overall is above 70', () => {
    const result = spawnCli(['audit', '--target', goodRepo, '--json']);
    const parsed = JSON.parse(result.stdout) as { overall: number };
    expect(parsed.overall).toBeGreaterThan(70);
  });
});

describe('CLI binary: bare-repo', () => {
  it('exits 1 with default --min-score 70 (score is 0)', () => {
    expect(spawnCli(['audit', '--target', bareRepo]).status).toBe(1);
  });

  it('exits 0 when --min-score is set to 0', () => {
    expect(spawnCli(['audit', '--target', bareRepo, '--min-score', '0']).status).toBe(0);
  });
});

describe('CLI binary: --min-score flag', () => {
  it('exits 1 when score is below the threshold', () => {
    // good-repo scores 100; threshold 999 forces a fail
    expect(spawnCli(['audit', '--target', goodRepo, '--min-score', '999']).status).toBe(1);
  });

  it('exits 0 when score meets the threshold', () => {
    expect(spawnCli(['audit', '--target', goodRepo, '--min-score', '70']).status).toBe(0);
  });
});

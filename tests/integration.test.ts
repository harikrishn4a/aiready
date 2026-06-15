import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve, join } from 'path';
import { loadRepo } from '../src/audit/loader';
import { crossRef } from '../src/audit/cross-ref';
import { scoreRepo } from '../src/audit/scorer';
import { mapFiles } from '../src/audit/mapper';
import type { LLMProvider } from '../src/utils/llm';

const root = resolve('.');
const goodRepo = join(root, 'test-fixtures', 'good-repo');
const bareRepo = join(root, 'test-fixtures', 'bare-repo');
const cliBin = join(root, 'dist', 'telemetry-bin.js');
const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version as string;

function cliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env['VITEST'];
  delete env['ANTHROPIC_API_KEY'];
  delete env['OPENAI_API_KEY'];
  env['DOTENV_CONFIG_PATH'] = join(root, 'tests', '.env.nonexistent');
  env['CLI_OPEN_TELEMETRY_DISABLE'] = '1';
  env['AIREADY_NO_UPDATE_CHECK'] = '1';
  return { ...env, ...extra };
}

function spawnCli(args: string[], env?: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync('node', [cliBin, ...args], { encoding: 'utf8', env: env ?? cliEnv() });
}

function makeProvider(scores: object): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(JSON.stringify(scores)),
    getTotalTokens: () => 0,
  };
}

function makeMapperProvider(mappings: object): LLMProvider {
  return {
    chat: vi.fn()
      .mockResolvedValueOnce(JSON.stringify({
        relevant: (mappings as { mappings: Array<{ path: string }> }).mappings.map((m) => m.path),
      }))
      .mockResolvedValueOnce(JSON.stringify(mappings)),
    getTotalTokens: () => 0,
  };
}

function goodScores() {
  return {
    identity: { score: 100, gaps: [] },
    verification: { score: 100, gaps: [] },
    state: { score: 100, gaps: [] },
    memory: { score: 100, gaps: [] },
    constraints: { score: 100, gaps: [] },
  };
}

function bareScores() {
  return {
    identity: { score: 0, gaps: ['No agent entry file'] },
    verification: { score: 0, gaps: ['No verification commands'] },
    state: { score: 0, gaps: ['No progress tracking'] },
    memory: { score: 0, gaps: ['No architecture doc'] },
    constraints: { score: 0, gaps: ['No constraints defined'] },
  };
}

// ── Pipeline-level integration ──────────────────────────────────────────────

describe('pipeline: good-repo loader', () => {
  it('loads without errors', () => {
    const files = loadRepo(goodRepo);
    expect(files.agentsMd).not.toBeNull();
    expect(files.architectureMd).not.toBeNull();
    expect(files.progressMd).not.toBeNull();
    expect(files.sessionHandoffMd).not.toBeNull();
    expect(files.packageJson).not.toBeNull();
  });

  it('populates mdFiles from good-repo', () => {
    const files = loadRepo(goodRepo);
    expect(files.mdFiles.length).toBeGreaterThan(0);
  });
});

describe('pipeline: good-repo scoring (mocked provider)', () => {
  it('scores above 70', async () => {
    const provider = makeProvider(goodScores());
    const files = loadRepo(goodRepo);
    const mappings = await mapFiles(files.mdFiles, makeMapperProvider({
      mappings: [
        { path: 'AGENTS.md', subsystems: ['identity', 'verification', 'constraints'] },
        { path: 'ARCHITECTURE.md', subsystems: ['memory'] },
        { path: 'PROGRESS.md', subsystems: ['state'] },
      ],
    }));
    const scored = await scoreRepo(files, mappings, provider);
    expect(scored.overall).toBeGreaterThanOrEqual(70);
  });

  it('passes cross-ref checks', () => {
    const files = loadRepo(goodRepo);
    // Pin mtime so progress-md-is-fresh is deterministic (git checkout sets
    // mtime to "now" on CI; local copies may be weeks old).
    files.progressMdModifiedAt = new Date();
    const xref = crossRef(files);
    const failed = xref.checks.filter((c) => !c.passed);
    expect(
      failed,
      failed.map((c) => `${c.name}: ${c.detail}`).join('; '),
    ).toHaveLength(0);
  });
});

describe('pipeline: bare-repo scoring (mocked provider)', () => {
  it('loads with all harness files null', () => {
    const files = loadRepo(bareRepo);
    expect(files.agentsMd).toBeNull();
    expect(files.architectureMd).toBeNull();
    expect(files.progressMd).toBeNull();
  });

  it('scores below 30', async () => {
    const provider = makeProvider(bareScores());
    const files = loadRepo(bareRepo);
    const mappings = await mapFiles(files.mdFiles, makeProvider(JSON.stringify({ relevant: [] })));
    const scored = await scoreRepo(files, mappings, provider);
    expect(scored.overall).toBeLessThan(30);
  });

  it('fails cross-ref checks', () => {
    const files = loadRepo(bareRepo);
    const xref = crossRef(files);
    expect(xref.checks.filter((c) => !c.passed).length).toBeGreaterThan(0);
  });
});

// ── CLI binary: ANTHROPIC_API_KEY guard ─────────────────────────────────────

describe('CLI binary: missing ANTHROPIC_API_KEY (anthropic provider)', () => {
  it('exits 1 when ANTHROPIC_API_KEY is not set', () => {
    const env = cliEnv();
    delete env['ANTHROPIC_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo, '--provider', 'anthropic', '--model', 'fast'], env);
    expect(result.status).toBe(1);
  }, 15_000);

  it('prints ERROR/WHY/FIX message when key is missing', () => {
    const env = cliEnv();
    delete env['ANTHROPIC_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo, '--provider', 'anthropic', '--model', 'fast'], env);
    expect(result.stderr).toContain('ANTHROPIC_API_KEY');
    expect(result.stderr).toContain('WHY:');
    expect(result.stderr).toContain('FIX:');
  }, 15_000);
});

describe('CLI binary: missing OPENAI_API_KEY (openai provider)', () => {
  it('exits 1 when OPENAI_API_KEY is not set', () => {
    const env = cliEnv();
    delete env['OPENAI_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo, '--provider', 'openai', '--model', 'fast'], env);
    expect(result.status).toBe(1);
  }, 15_000);
});

// ── CLI binary: graph command ────────────────────────────────────────────────

describe('CLI binary: graph', () => {
  it('exits 1 with a clear error when the target directory does not exist', () => {
    const result = spawnCli(['graph', '--target', join(root, 'no', 'such', 'dir', 'xyz')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Target directory not found');
  }, 15_000);
});

// ── CLI binary: --help / --version ───────────────────────────────────────────

describe('CLI binary: --version', () => {
  it('prints version and exits 0', () => {
    const result = spawnCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(pkgVersion);
  }, 15_000);
});

describe('CLI binary: --help', () => {
  it('exits 0', () => {
    expect(spawnCli(['--help']).status).toBe(0);
  }, 15_000);

  it('lists audit command in help', () => {
    expect(spawnCli(['--help']).stdout).toContain('audit');
  }, 15_000);

  it('lists graph command in help', () => {
    expect(spawnCli(['--help']).stdout).toContain('graph');
  }, 15_000);

  it('audit --help shows --provider and --model flags', () => {
    const out = spawnCli(['audit', '--help']).stdout;
    expect(out).toContain('--provider');
    expect(out).toContain('--model');
  }, 15_000);
});

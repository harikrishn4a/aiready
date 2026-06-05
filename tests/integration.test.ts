import { describe, it, expect, vi, beforeEach } from 'vitest';
import { spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { loadRepo } from '../src/audit/loader';
import { crossRef } from '../src/audit/cross-ref';
import { scoreRepo } from '../src/audit/scorer';
import { mapFiles } from '../src/audit/mapper';

// Mock the Anthropic SDK for all tests in this file
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: MockAnthropic };
});

async function getCreate() {
  const sdk = await import('@anthropic-ai/sdk');
  const Cls = sdk.default as unknown as { _mockCreate: ReturnType<typeof vi.fn> };
  return Cls._mockCreate;
}

const root = resolve('.');
const goodRepo = join(root, 'test-fixtures', 'good-repo');
const bareRepo = join(root, 'test-fixtures', 'bare-repo');
const cliBin = join(root, 'dist', 'cli.js');

function cliEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env['VITEST'];
  return { ...env, ...extra };
}

function spawnCli(args: string[], env?: NodeJS.ProcessEnv): ReturnType<typeof spawnSync> {
  return spawnSync('node', [cliBin, ...args], { encoding: 'utf8', env: env ?? cliEnv() });
}

function mockGoodScores() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        identity: { score: 100, gaps: [] },
        verification: { score: 100, gaps: [] },
        state: { score: 100, gaps: [] },
        memory: { score: 100, gaps: [] },
        constraints: { score: 100, gaps: [] },
      }),
    }],
  };
}

function mockBareScores() {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({
        identity: { score: 0, gaps: ['No agent entry file'] },
        verification: { score: 0, gaps: ['No verification commands'] },
        state: { score: 0, gaps: ['No progress tracking'] },
        memory: { score: 0, gaps: ['No architecture doc'] },
        constraints: { score: 0, gaps: ['No constraints defined'] },
      }),
    }],
  };
}

const TEST_KEY = 'test-key';

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

describe('pipeline: good-repo scoring (mocked LLM)', () => {
  beforeEach(async () => {
    const create = await getCreate();
    // First call = mapper (haiku), second call = scorer (sonnet)
    create
      .mockResolvedValueOnce({
        content: [{
          type: 'text',
          text: JSON.stringify({
            mappings: [
              { path: 'AGENTS.md', subsystems: ['identity', 'verification', 'constraints'] },
              { path: 'ARCHITECTURE.md', subsystems: ['memory'] },
              { path: 'PROGRESS.md', subsystems: ['state'] },
              { path: 'SESSION-HANDOFF.md', subsystems: ['state'] },
              { path: 'CONSTRAINTS.md', subsystems: ['constraints'] },
            ],
          }),
        }],
      })
      .mockResolvedValueOnce(mockGoodScores());
  });

  it('scores above 70', async () => {
    const files = loadRepo(goodRepo);
    const mappings = await mapFiles(files.mdFiles, TEST_KEY);
    const scored = await scoreRepo(files, mappings, TEST_KEY);
    expect(scored.overall).toBeGreaterThan(70);
  });

  it('passes cross-ref checks', async () => {
    const files = loadRepo(goodRepo);
    const xref = crossRef(files);
    const failed = xref.checks.filter((c) => !c.passed);
    expect(failed).toHaveLength(0);
  });
});

describe('pipeline: bare-repo scoring (mocked LLM)', () => {
  beforeEach(async () => {
    const create = await getCreate();
    create
      .mockResolvedValueOnce({
        content: [{ type: 'text', text: JSON.stringify({ mappings: [] }) }],
      })
      .mockResolvedValueOnce(mockBareScores());
  });

  it('loads with all harness files null', () => {
    const files = loadRepo(bareRepo);
    expect(files.agentsMd).toBeNull();
    expect(files.architectureMd).toBeNull();
    expect(files.progressMd).toBeNull();
  });

  it('scores below 30', async () => {
    const files = loadRepo(bareRepo);
    const mappings = await mapFiles(files.mdFiles, TEST_KEY);
    const scored = await scoreRepo(files, mappings, TEST_KEY);
    expect(scored.overall).toBeLessThan(30);
  });

  it('fails cross-ref checks', () => {
    const files = loadRepo(bareRepo);
    const xref = crossRef(files);
    const failed = xref.checks.filter((c) => !c.passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});

// ── CLI binary: ANTHROPIC_API_KEY guard ─────────────────────────────────────

describe('CLI binary: missing ANTHROPIC_API_KEY', () => {
  it('exits 1 when ANTHROPIC_API_KEY is not set', () => {
    const env = cliEnv();
    delete env['ANTHROPIC_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo], env);
    expect(result.status).toBe(1);
  });

  it('prints ERROR/WHY/FIX message when key is missing', () => {
    const env = cliEnv();
    delete env['ANTHROPIC_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo], env);
    expect(result.stderr).toContain('ANTHROPIC_API_KEY');
    expect(result.stderr).toContain('WHY:');
    expect(result.stderr).toContain('FIX:');
  });
});

// ── CLI binary: --help / --version don't need LLM ───────────────────────────

describe('CLI binary: --version', () => {
  it('prints version and exits 0', () => {
    const result = spawnCli(['--version']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('0.1.0');
  });
});

describe('CLI binary: --help', () => {
  it('exits 0', () => {
    expect(spawnCli(['--help']).status).toBe(0);
  });

  it('lists audit command in help', () => {
    expect(spawnCli(['--help']).stdout).toContain('audit');
  });
});

// ── CLI binary: --min-score flag (no LLM needed for these cases) ─────────────

describe('CLI binary: --min-score missing key', () => {
  it('exits 1 from missing key before min-score logic', () => {
    const env = cliEnv();
    delete env['ANTHROPIC_API_KEY'];
    const result = spawnCli(['audit', '--target', goodRepo, '--min-score', '0'], env);
    expect(result.status).toBe(1);
  });
});

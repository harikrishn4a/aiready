import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { executeGenerate, executeImprove, type InitFlags } from '../src/init/executor';
import type { LLMProvider } from '../src/utils/llm';
import type { ArtifactPlan } from '../src/init/planner';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-init-exec-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function mockProvider(response = '# Generated content\n\nsome content here'): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

const BASE_GENERATE: ArtifactPlan = {
  filename: 'PROGRESS.md',
  action: 'generate',
  subsystem: 'state',
  templateFile: 'examples/progress.md',
  sourceFiles: ['package.json'],
  currentScore: 0,
  reason: 'file does not exist',
  alwaysGenerate: false,
};

const BASE_IMPROVE: ArtifactPlan = {
  filename: 'AGENTS.md',
  action: 'improve',
  subsystem: 'verification',
  templateFile: 'examples/agents.md',
  sourceFiles: [],
  currentScore: 45,
  reason: 'score 45/100 — below threshold',
  alwaysGenerate: false,
};

describe('executeGenerate', () => {
  it('writes new file when it does not exist', async () => {
    const provider = mockProvider('# PROGRESS\n\ncontent');
    await executeGenerate(BASE_GENERATE, tmp, {}, 1, 1, provider);
    expect(existsSync(join(tmp, 'PROGRESS.md'))).toBe(true);
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# PROGRESS\n\ncontent');
  });

  it('skips existing file without --force', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    await executeGenerate(BASE_GENERATE, tmp, {}, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# existing');
  });

  it('overwrites existing file with --force true', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider('# new content');
    await executeGenerate(BASE_GENERATE, tmp, { force: true }, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# new content');
  });

  it('overwrites with --force matching filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider('# new content');
    await executeGenerate(BASE_GENERATE, tmp, { force: 'PROGRESS.md' }, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
  });

  it('does not overwrite with --force for different filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    await executeGenerate(BASE_GENERATE, tmp, { force: 'CONSTRAINTS.md' }, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('creates parent directories when needed', async () => {
    const artifact: ArtifactPlan = { ...BASE_GENERATE, filename: 'docs/PROGRESS.md' };
    const provider = mockProvider('# content');
    await executeGenerate(artifact, tmp, {}, 1, 1, provider);
    expect(existsSync(join(tmp, 'docs', 'PROGRESS.md'))).toBe(true);
  });

  it('calls provider with fast: false for quality output', async () => {
    const provider = mockProvider('# content');
    await executeGenerate(BASE_GENERATE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });

  it('overwrites existing file when alwaysGenerate is true without --force', async () => {
    writeFileSync(join(tmp, 'TASK.md'), '# existing task');
    // alwaysGenerate=true means blank template — copied directly, no LLM call needed
    const artifact: ArtifactPlan = { ...BASE_GENERATE, filename: 'TASK.md', alwaysGenerate: true };
    const provider = mockProvider('# blank task template');
    await executeGenerate(artifact, tmp, {}, 1, 1, provider);
    // File should be overwritten (not skipped) — alwaysGenerate bypasses the existsSync guard
    const written = readFileSync(join(tmp, 'TASK.md'), 'utf-8');
    expect(written).not.toBe('# existing task');
  });
});

describe('executeImprove', () => {
  it('skips when file does not exist', async () => {
    const provider = mockProvider();
    await executeImprove(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('writes updated content when file exists', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original');
    const provider = mockProvider('# updated content');
    await executeImprove(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'AGENTS.md'), 'utf-8')).toBe('# updated content');
  });

  it('passes current file content to provider', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original content to improve');
    const provider = mockProvider('# improved');
    await executeImprove(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain('# original content to improve');
  });

  it('reads file fresh from disk on each call', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# v1');
    const provider = mockProvider('# v2');
    await executeImprove(BASE_IMPROVE, tmp, {}, 1, 2, provider);
    writeFileSync(join(tmp, 'AGENTS.md'), '# v2 modified externally');
    await executeImprove(BASE_IMPROVE, tmp, {}, 2, 2, provider);
    const secondCall = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(secondCall[1]).toContain('# v2 modified externally');
  });

  it('calls provider with fast: false', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original');
    const provider = mockProvider('# improved');
    await executeImprove(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });
});

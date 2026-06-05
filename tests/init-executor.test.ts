import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { executeGenerate, executeImprove, type InitFlags } from '../src/init/executor';
import type { LLMProvider } from '../src/utils/llm';
import type { GenerateItem, ImproveItem } from '../src/init/parser';

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

const BASE_GENERATE: GenerateItem = {
  filename: 'PROGRESS.md',
  subsystem: 'state',
  required: 'current state, completed items',
  templateFile: 'examples/progress.md',
  sourceSignals: ['package.json'],
  writePolicy: ['create only if missing'],
};

const BASE_IMPROVE: ImproveItem = {
  filename: 'AGENTS.md',
  subsystem: 'verification',
  section: 'verification section',
  missing: 'no commands',
  fix: 'add verification commands',
  templateSection: 'examples/agents.md → Verification Commands',
  sourceFiles: [],
  writePolicy: [],
  findings: [],
};

describe('executeGenerate', () => {
  it('writes new file when it does not exist', async () => {
    const provider = mockProvider('# PROGRESS\n\ncontent');
    const flags: InitFlags = {};
    await executeGenerate(BASE_GENERATE, tmp, flags, 1, 1, provider);
    expect(existsSync(join(tmp, 'PROGRESS.md'))).toBe(true);
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# PROGRESS\n\ncontent');
  });

  it('skips existing file without --force', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    const flags: InitFlags = {};
    await executeGenerate(BASE_GENERATE, tmp, flags, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# existing');
  });

  it('overwrites existing file with --force true', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider('# new content');
    const flags: InitFlags = { force: true };
    await executeGenerate(BASE_GENERATE, tmp, flags, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# new content');
  });

  it('overwrites with --force matching filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider('# new content');
    const flags: InitFlags = { force: 'PROGRESS.md' };
    await executeGenerate(BASE_GENERATE, tmp, flags, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
  });

  it('does not overwrite with --force for different filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    const flags: InitFlags = { force: 'CONSTRAINTS.md' };
    await executeGenerate(BASE_GENERATE, tmp, flags, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('creates parent directories when needed', async () => {
    const item: GenerateItem = { ...BASE_GENERATE, filename: 'docs/PROGRESS.md' };
    const provider = mockProvider('# content');
    await executeGenerate(item, tmp, {}, 1, 1, provider);
    expect(existsSync(join(tmp, 'docs', 'PROGRESS.md'))).toBe(true);
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
});

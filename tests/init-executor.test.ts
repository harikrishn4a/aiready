import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { executeArtifact } from '../src/init/executor';
import type { LLMProvider } from '../src/utils/llm';
import type { ArtifactPlan } from '../src/init/planner';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-init-exec-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function multiLine(prefix: string, count = 5): string {
  return [prefix, '', ...Array.from({ length: count }, (_, i) => `line ${i + 1}`)].join('\n');
}

function mockProvider(response = multiLine('# Generated content')): LLMProvider {
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
  generateOnly: false,
};

const BASE_IMPROVE: ArtifactPlan = {
  filename: 'AGENTS.md',
  action: 'improve',
  subsystem: 'identity',
  templateFile: 'examples/agents.md',
  sourceFiles: [],
  currentScore: 45,
  reason: 'score 45/100 — below threshold',
  alwaysGenerate: false,
  generateOnly: false,
};

describe('executeArtifact — generate', () => {
  it('writes new file when it does not exist', async () => {
    const lines = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
    const provider = mockProvider(`# PROGRESS\n\n${lines}`);
    await executeArtifact(BASE_GENERATE, tmp, {}, 1, 1, provider);
    expect(existsSync(join(tmp, 'PROGRESS.md'))).toBe(true);
    const written = readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8');
    expect(written.split('\n').length).toBeGreaterThan(10);
  });

  it('strips markdown fences from LLM output before writing', async () => {
    const body = Array.from({ length: 12 }, (_, i) => `line ${i + 1}`).join('\n');
    const provider = mockProvider(`\`\`\`markdown\n# PROGRESS\n\n${body}\n\`\`\``);
    await executeArtifact(BASE_GENERATE, tmp, {}, 1, 1, provider);
    const written = readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8');
    expect(written).not.toContain('```');
    expect(written.split('\n').length).toBeGreaterThan(10);
  });

  it('skips existing file without --force', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    await executeArtifact(BASE_GENERATE, tmp, {}, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe('# existing');
  });

  it('overwrites existing file with --force true', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const body = multiLine('# new content');
    const provider = mockProvider(body);
    await executeArtifact(BASE_GENERATE, tmp, { force: true }, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'PROGRESS.md'), 'utf-8')).toBe(body);
  });

  it('overwrites with --force matching filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider(multiLine('# new content'));
    await executeArtifact(BASE_GENERATE, tmp, { force: 'PROGRESS.md' }, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
  });

  it('does not overwrite with --force for different filename', async () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '# existing');
    const provider = mockProvider();
    await executeArtifact(BASE_GENERATE, tmp, { force: 'CONSTRAINTS.md' }, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('creates parent directories when needed', async () => {
    const artifact: ArtifactPlan = { ...BASE_GENERATE, filename: 'docs/PROGRESS.md' };
    const provider = mockProvider(multiLine('# content'));
    await executeArtifact(artifact, tmp, {}, 1, 1, provider);
    expect(existsSync(join(tmp, 'docs', 'PROGRESS.md'))).toBe(true);
  });

  it('calls provider with fast: false for quality output', async () => {
    const provider = mockProvider(multiLine('# content'));
    await executeArtifact(BASE_GENERATE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });

  it('generateOnly artifact is written as a template copy without calling the LLM', async () => {
    writeFileSync(join(tmp, 'TASK.md'), '# existing task');
    const artifact: ArtifactPlan = {
      ...BASE_GENERATE, filename: 'TASK.md', templateFile: 'examples/task.md',
      subsystem: null, alwaysGenerate: true, generateOnly: true,
    };
    const provider = mockProvider('# blank task template');
    await executeArtifact(artifact, tmp, {}, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
    const written = readFileSync(join(tmp, 'TASK.md'), 'utf-8');
    expect(written).not.toBe('# existing task');
  });
});

describe('executeArtifact — improve', () => {
  it('skips when file does not exist', async () => {
    const provider = mockProvider();
    await executeArtifact(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('writes updated content when file exists', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original');
    const body = multiLine('# updated content');
    const provider = mockProvider(body);
    await executeArtifact(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    expect(provider.chat).toHaveBeenCalled();
    expect(readFileSync(join(tmp, 'AGENTS.md'), 'utf-8')).toBe(body);
  });

  it('passes current file content to provider', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original content to improve');
    const provider = mockProvider(multiLine('# improved'));
    await executeArtifact(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain('# original content to improve');
  });

  it('reads file fresh from disk on each call', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# v1');
    const provider = mockProvider(multiLine('# v2'));
    await executeArtifact(BASE_IMPROVE, tmp, {}, 1, 2, provider);
    writeFileSync(join(tmp, 'AGENTS.md'), '# v2 modified externally');
    await executeArtifact(BASE_IMPROVE, tmp, {}, 2, 2, provider);
    const allCalls = (provider.chat as ReturnType<typeof vi.fn>).mock.calls;
    const freshReadCall = allCalls.find((c: [string, string, ...unknown[]]) =>
      c[1].includes('# v2 modified externally'),
    );
    expect(freshReadCall).toBeDefined();
  });

  it('calls provider with fast: false', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original');
    const provider = mockProvider(multiLine('# improved'));
    await executeArtifact(BASE_IMPROVE, tmp, {}, 1, 1, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });

  it('uses the template (generate-from-scratch) path when improving an empty file', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '');
    writeFileSync(join(tmp, 'package.json'), '{"name":"test"}');
    const lines = Array.from({ length: 12 }, (_, i) => `section ${i + 1}`).join('\n');
    const provider = mockProvider(`# AGENTS\n\n${lines}`);
    const artifact: ArtifactPlan = { ...BASE_IMPROVE, sourceFiles: ['package.json'] };
    await executeArtifact(artifact, tmp, {}, 1, 1, provider);
    const written = readFileSync(join(tmp, 'AGENTS.md'), 'utf-8');
    expect(written.split('\n').length).toBeGreaterThan(10);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain('=== TEMPLATE ===');
  });

  it('throws when LLM returns empty content on improve', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# original');
    const provider = mockProvider('');
    await expect(executeArtifact(BASE_IMPROVE, tmp, {}, 1, 1, provider)).rejects.toThrow(/empty or too short/);
  });

  it('throws when LLM returns empty content on empty-file path', async () => {
    writeFileSync(join(tmp, 'CONSTRAINTS.md'), '');
    const artifact: ArtifactPlan = {
      ...BASE_IMPROVE, filename: 'CONSTRAINTS.md',
      templateFile: 'examples/constraints.md', subsystem: 'constraints',
    };
    const provider = mockProvider('  ');
    await expect(executeArtifact(artifact, tmp, {}, 1, 1, provider)).rejects.toThrow(/empty or too short/);
  });
});

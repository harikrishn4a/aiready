import { describe, it, expect, vi } from 'vitest';
import { mapFiles } from '../src/audit/mapper';
import type { LLMProvider } from '../src/utils/llm';
import type { RepoFile } from '../src/audit/loader';

function makeProvider(response: string): LLMProvider {
  return { chat: vi.fn().mockResolvedValue(response) };
}

function makeFile(path: string, preview = '# Content'): RepoFile {
  return { path, name: path.split('/').pop() ?? path, preview, fullContent: preview };
}

describe('mapFiles — basic behaviour', () => {
  it('returns empty array for empty file list without calling provider', async () => {
    const provider = makeProvider('{}');
    expect(await mapFiles([], provider)).toEqual([]);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('returns parsed mappings from provider response', async () => {
    const provider = makeProvider(JSON.stringify({
      mappings: [
        { path: 'AGENTS.md', subsystems: ['identity', 'constraints'] },
        { path: 'PROGRESS.md', subsystems: ['state'] },
      ],
    }));

    const files = [makeFile('AGENTS.md'), makeFile('PROGRESS.md')];
    const result = await mapFiles(files, provider);

    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe('AGENTS.md');
    expect(result[0]?.subsystems).toContain('identity');
    expect(result[0]?.subsystems).toContain('constraints');
    expect(result[1]?.path).toBe('PROGRESS.md');
    expect(result[1]?.subsystems).toContain('state');
  });

  it('calls provider.chat with fast: true', async () => {
    const provider = makeProvider('{"mappings":[]}');
    await mapFiles([makeFile('README.md')], provider);
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { fast: true },
    );
  });
});

describe('mapFiles — invalid LLM responses', () => {
  it('returns empty array when provider returns invalid JSON', async () => {
    expect(await mapFiles([makeFile('README.md')], makeProvider('not json'))).toEqual([]);
  });

  it('returns empty array when provider returns JSON without mappings', async () => {
    expect(await mapFiles([makeFile('README.md')], makeProvider('{"error":"unknown"}'))).toEqual([]);
  });

  it('filters out unknown subsystem values', async () => {
    const provider = makeProvider(JSON.stringify({
      mappings: [{ path: 'file.md', subsystems: ['identity', 'bogus', 'fake'] }],
    }));
    const result = await mapFiles([makeFile('file.md')], provider);
    expect(result[0]?.subsystems).toEqual(['identity']);
  });

  it('omits entries where all subsystems were invalid', async () => {
    const provider = makeProvider(JSON.stringify({
      mappings: [{ path: 'file.md', subsystems: ['bogus'] }],
    }));
    expect(await mapFiles([makeFile('file.md')], provider)).toHaveLength(0);
  });
});

describe('mapFiles — prompt includes file info', () => {
  it('includes file path and preview in user message', async () => {
    const provider = makeProvider('{"mappings":[]}');
    await mapFiles([makeFile('AGENTS.md', '# AI Agents\nThis project...')], provider);

    const [, userMsg] = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string];
    expect(userMsg).toContain('AGENTS.md');
    expect(userMsg).toContain('AI Agents');
  });
});

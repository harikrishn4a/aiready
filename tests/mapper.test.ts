import { describe, it, expect, vi } from 'vitest';
import { mapFiles } from '../src/audit/mapper';
import type { LLMProvider } from '../src/utils/llm';
import type { RepoFile } from '../src/audit/loader';

function makeProvider(triage: string, classification?: string): LLMProvider {
  const chat = classification !== undefined
    ? vi.fn().mockResolvedValueOnce(triage).mockResolvedValueOnce(classification)
    : vi.fn().mockResolvedValue(triage);
  return { chat, getTotalTokens: () => 0 };
}

function makeFile(path: string, content = '# Content'): RepoFile {
  return { path, name: path.split('/').pop() ?? path, preview: content.slice(0, 200), fullContent: content };
}

describe('mapFiles — basic behaviour', () => {
  it('returns empty array for empty file list without calling provider', async () => {
    const provider = makeProvider('{}');
    expect(await mapFiles([], provider)).toEqual([]);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('returns parsed mappings from two-stage provider responses', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['AGENTS.md', 'PROGRESS.md'] }),
      JSON.stringify({
        mappings: [
          { path: 'AGENTS.md', subsystems: ['identity', 'constraints'] },
          { path: 'PROGRESS.md', subsystems: ['state'] },
        ],
      }),
    );

    const files = [makeFile('AGENTS.md'), makeFile('PROGRESS.md'), makeFile('LICENSE.md')];
    const result = await mapFiles(files, provider);

    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe('AGENTS.md');
    expect(result[0]?.subsystems).toContain('identity');
    expect(result[1]?.path).toBe('PROGRESS.md');
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('calls provider.chat with fast: true on both stages', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['README.md'] }),
      '{"mappings":[]}',
    );
    await mapFiles([makeFile('README.md')], provider);
    expect(provider.chat).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(String), { fast: true });
    expect(provider.chat).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(String), { fast: true });
  });

  it('returns empty array when triage finds no relevant files', async () => {
    const provider = makeProvider(JSON.stringify({ relevant: [] }));
    const result = await mapFiles([makeFile('LICENSE.md')], provider);
    expect(result).toEqual([]);
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });
});

describe('mapFiles — invalid LLM responses', () => {
  it('returns empty array when classification returns invalid JSON', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['README.md'] }),
      'not json',
    );
    expect(await mapFiles([makeFile('README.md')], provider)).toEqual([]);
  });

  it('returns empty array when triage returns invalid JSON', async () => {
    const provider = makeProvider('not json');
    expect(await mapFiles([makeFile('README.md')], provider)).toEqual([]);
  });

  it('filters out unknown subsystem values', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['file.md'] }),
      JSON.stringify({
        mappings: [{ path: 'file.md', subsystems: ['identity', 'bogus'] }],
      }),
    );
    const result = await mapFiles([makeFile('file.md')], provider);
    expect(result[0]?.subsystems).toEqual(['identity']);
  });
});

describe('mapFiles — prompt content', () => {
  it('sends 5-line previews in triage and 50-line previews in classification', async () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line-${i + 1}`).join('\n');
    const provider = makeProvider(
      JSON.stringify({ relevant: ['AGENTS.md'] }),
      '{"mappings":[]}',
    );
    await mapFiles([makeFile('AGENTS.md', lines)], provider);

    const triageMsg = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as string;
    const classifyMsg = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[1]?.[1] as string;

    expect(triageMsg).toContain('line-5');
    expect(triageMsg).not.toContain('line-6');
    expect(classifyMsg).toContain('line-50');
    expect(classifyMsg).not.toContain('line-51');
  });
});

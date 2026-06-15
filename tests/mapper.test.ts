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

  it('adds constraints mapping when full content contains hard constraint language', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['CLAUDE.md'] }),
      JSON.stringify({
        mappings: [{ path: 'CLAUDE.md', subsystems: ['identity'] }],
      }),
    );
    const content = [
      '# CLAUDE.md',
      'Project overview and setup notes.',
      '',
      '## Key constraint',
      'The corroboration endpoint MUST NOT modify the existing analysis pipeline.',
    ].join('\n');

    const result = await mapFiles([makeFile('CLAUDE.md', content)], provider);

    expect(result[0]?.path).toBe('CLAUDE.md');
    expect(result[0]?.subsystems).toContain('identity');
    expect(result[0]?.subsystems).toContain('constraints');
  });

  it('maps full-content signals for all subsystems even when triage misses them', async () => {
    const provider = makeProvider(JSON.stringify({ relevant: [] }));
    const files = [
      makeFile('README.md', '## Project overview\nTech stack: Node.js\nRepository structure: src/ and tests/.'),
      makeFile('PLAN.md', '## Verification\nRun npm run build and npm run test before marking work done.'),
      makeFile('CHECKPOINT.md', '## Current state\nCompleted backend work. Blocked on UI review. Next step: test.'),
      makeFile('DESIGN.md', '## Module map\nKey files: src/cli.ts. Data flow: CLI to audit pipeline.'),
      makeFile('CLAUDE.md', '## Key constraints\nMUST NOT modify user files without confirmation.'),
    ];

    const result = await mapFiles(files, provider);
    const byPath = new Map(result.map((mapping) => [mapping.path, mapping.subsystems]));

    expect(byPath.get('README.md')).toContain('identity');
    expect(byPath.get('PLAN.md')).toContain('verification');
    expect(byPath.get('CHECKPOINT.md')).toContain('state');
    expect(byPath.get('DESIGN.md')).toContain('memory');
    expect(byPath.get('CLAUDE.md')).toContain('constraints');
    expect(provider.chat).toHaveBeenCalledTimes(1);
  });

  it('calls provider.chat with fast: true on both stages', async () => {
    const provider = makeProvider(
      JSON.stringify({ relevant: ['README.md'] }),
      '{"mappings":[]}',
    );
    await mapFiles([makeFile('README.md')], provider);
    expect(provider.chat).toHaveBeenNthCalledWith(1, expect.any(String), expect.any(String), { fast: true, temperature: 0, seed: 7 });
    expect(provider.chat).toHaveBeenNthCalledWith(2, expect.any(String), expect.any(String), { fast: true, temperature: 0, seed: 7 });
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

    expect(triageMsg).toContain('AGENTS.md');
    expect(triageMsg).toContain('line-5');
    expect(triageMsg).not.toContain('line-6');
    expect(classifyMsg).toContain('line-50');
    expect(classifyMsg).not.toContain('line-51');
  });

  it('skips triage and goes straight to classify when usedGraphify is true', async () => {
    const provider = makeProvider(
      JSON.stringify({ mappings: [{ path: 'AGENTS.md', subsystems: ['identity'] }] }),
    );
    const result = await mapFiles([makeFile('AGENTS.md')], provider, true);
    expect(provider.chat).toHaveBeenCalledTimes(1); // classify only, no triage
    expect(result[0]?.path).toBe('AGENTS.md');
    expect(result[0]?.subsystems).toContain('identity');
  });
});

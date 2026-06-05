import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mapFiles } from '../src/audit/mapper';
import type { RepoFile } from '../src/audit/loader';

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

function makeFile(path: string, preview = '# Content'): RepoFile {
  return { path, name: path.split('/').pop() ?? path, preview, fullContent: preview };
}

const TEST_KEY = 'test-key';

describe('mapFiles — basic behaviour', () => {
  it('returns empty array for empty file list', async () => {
    expect(await mapFiles([], TEST_KEY)).toEqual([]);
  });

  it('returns parsed mappings from LLM response', async () => {
    const create = await getCreate();
    create.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          mappings: [
            { path: 'AGENTS.md', subsystems: ['identity', 'constraints'] },
            { path: 'PROGRESS.md', subsystems: ['state'] },
          ],
        }),
      }],
    });

    const files = [makeFile('AGENTS.md'), makeFile('PROGRESS.md')];
    const result = await mapFiles(files, TEST_KEY);

    expect(result).toHaveLength(2);
    expect(result[0]?.path).toBe('AGENTS.md');
    expect(result[0]?.subsystems).toContain('identity');
    expect(result[0]?.subsystems).toContain('constraints');
    expect(result[1]?.path).toBe('PROGRESS.md');
    expect(result[1]?.subsystems).toContain('state');
  });

  it('uses claude-haiku-4-5-20251001 model', async () => {
    const create = await getCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '{"mappings":[]}' }] });
    await mapFiles([makeFile('README.md')], TEST_KEY);
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('claude-haiku-4-5-20251001');
  });
});

describe('mapFiles — invalid LLM responses', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
  });

  it('returns empty array when LLM returns invalid JSON', async () => {
    const create = await getCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'not json' }] });
    const result = await mapFiles([makeFile('README.md')], TEST_KEY);
    expect(result).toEqual([]);
  });

  it('returns empty array when LLM returns JSON without mappings', async () => {
    const create = await getCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '{"error": "unknown"}' }] });
    const result = await mapFiles([makeFile('README.md')], TEST_KEY);
    expect(result).toEqual([]);
  });

  it('filters out unknown subsystem values', async () => {
    const create = await getCreate();
    create.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          mappings: [{ path: 'file.md', subsystems: ['identity', 'bogus', 'fake'] }],
        }),
      }],
    });
    const result = await mapFiles([makeFile('file.md')], TEST_KEY);
    expect(result[0]?.subsystems).toEqual(['identity']);
  });

  it('omits entries where all subsystems were invalid', async () => {
    const create = await getCreate();
    create.mockResolvedValue({
      content: [{
        type: 'text',
        text: JSON.stringify({
          mappings: [{ path: 'file.md', subsystems: ['bogus'] }],
        }),
      }],
    });
    const result = await mapFiles([makeFile('file.md')], TEST_KEY);
    expect(result).toHaveLength(0);
  });
});

describe('mapFiles — prompt includes file info', () => {
  it('includes file path and preview in user message', async () => {
    const create = await getCreate();
    create.mockClear();
    create.mockResolvedValue({ content: [{ type: 'text', text: '{"mappings":[]}' }] });
    const files = [makeFile('AGENTS.md', '# AI Agents\nThis project...')];
    await mapFiles(files, TEST_KEY);

    const call = create.mock.calls[0] as [{ messages: Array<{ content: string }> }];
    const userContent = call[0].messages[0]?.content ?? '';
    expect(userContent).toContain('AGENTS.md');
    expect(userContent).toContain('AI Agents');
  });
});

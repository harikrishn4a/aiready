import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreRepo } from '../src/audit/scorer';
import type { RepoFiles } from '../src/audit/loader';
import type { FileMapping } from '../src/audit/mapper';

// Mock the Anthropic SDK before any imports that use it
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: MockAnthropic };
});

function mockLLMResponse(scores: {
  identity?: { score: number; gaps: string[] };
  verification?: { score: number; gaps: string[] };
  state?: { score: number; gaps: string[] };
  memory?: { score: number; gaps: string[] };
  constraints?: { score: number; gaps: string[] };
}) {
  const full = {
    identity: { score: 0, gaps: ['No files mapped to this subsystem'] },
    verification: { score: 0, gaps: ['No files mapped to this subsystem'] },
    state: { score: 0, gaps: ['No files mapped to this subsystem'] },
    memory: { score: 0, gaps: ['No files mapped to this subsystem'] },
    constraints: { score: 0, gaps: ['No files mapped to this subsystem'] },
    ...scores,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(full) }],
  };
}

async function getCreate() {
  const sdk = await import('@anthropic-ai/sdk');
  const Cls = sdk.default as unknown as { _mockCreate: ReturnType<typeof vi.fn> };
  return Cls._mockCreate;
}

function makeFiles(overrides: Partial<RepoFiles> = {}): RepoFiles {
  return {
    mdFiles: [],
    agentsMd: null,
    architectureMd: null,
    constraintsMd: null,
    progressMd: null,
    sessionHandoffMd: null,
    packageJsonRaw: null,
    packageJson: null,
    srcDirs: [],
    rootFiles: [],
    progressMdModifiedAt: null,
    targetDir: '/tmp/test',
    ...overrides,
  };
}

const TEST_API_KEY = 'test-key';

describe('scoreRepo — structure', () => {
  beforeEach(async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({}));
  });

  it('returns all 5 subsystems', async () => {
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result).toHaveProperty('identity');
    expect(result).toHaveProperty('verification');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('memory');
    expect(result).toHaveProperty('constraints');
  });

  it('returns overall score', async () => {
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(typeof result.overall).toBe('number');
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('includes crossRef in result', async () => {
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result).toHaveProperty('crossRef');
    expect(result.crossRef).toHaveProperty('checks');
  });

  it('each subsystem has score, gaps, and files', async () => {
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    for (const key of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
      expect(typeof result[key].score).toBe('number');
      expect(Array.isArray(result[key].gaps)).toBe(true);
      expect(Array.isArray(result[key].files)).toBe(true);
    }
  });
});

describe('scoreRepo — LLM scores are reflected', () => {
  it('uses LLM score for identity', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({ identity: { score: 85, gaps: ['Need version'] } }));
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result.identity.score).toBe(85);
    expect(result.identity.gaps).toContain('Need version');
  });

  it('clamps score to 0-100', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({ verification: { score: 150, gaps: [] } }));
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result.verification.score).toBe(100);
  });

  it('overall is average of 5 subsystem scores', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({
      identity: { score: 80, gaps: [] },
      verification: { score: 60, gaps: [] },
      state: { score: 40, gaps: [] },
      memory: { score: 100, gaps: [] },
      constraints: { score: 70, gaps: [] },
    }));
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result.overall).toBe(70); // (80+60+40+100+70)/5
  });
});

describe('scoreRepo — file attribution', () => {
  it('includes mapped file paths in subsystem.files', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({ identity: { score: 80, gaps: [] } }));

    const mdFiles = [
      { path: 'AGENTS.md', name: 'AGENTS.md', preview: '# Agents', fullContent: '# Agents\nContent' },
    ];
    const mappings: FileMapping[] = [
      { path: 'AGENTS.md', subsystems: ['identity'] },
    ];

    const result = await scoreRepo(makeFiles({ mdFiles }), mappings, TEST_API_KEY);
    expect(result.identity.files).toContain('AGENTS.md');
  });

  it('files is empty when no files are mapped to subsystem', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({}));
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result.identity.files).toHaveLength(0);
  });
});

describe('scoreRepo — graceful LLM failure', () => {
  it('returns 0 scores when LLM returns invalid JSON', async () => {
    const create = await getCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'sorry, I cannot help' }] });
    const result = await scoreRepo(makeFiles(), [], TEST_API_KEY);
    expect(result.identity.score).toBe(0);
    expect(result.overall).toBe(0);
  });

  it('uses claude-sonnet-4-6 model', async () => {
    const create = await getCreate();
    create.mockResolvedValue(mockLLMResponse({}));
    await scoreRepo(makeFiles(), [], TEST_API_KEY);
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('claude-sonnet-4-6');
  });
});

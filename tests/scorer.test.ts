import { describe, it, expect, vi } from 'vitest';
import { scoreRepo } from '../src/audit/scorer';
import type { LLMProvider } from '../src/utils/llm';
import type { RepoFiles } from '../src/audit/loader';
import type { FileMapping } from '../src/audit/mapper';

function makeProvider(response: object): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(JSON.stringify(response)),
    getTotalTokens: () => 0,
  };
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

function allZeroScores() {
  return {
    identity: { score: 0, gaps: ['No files'] },
    verification: { score: 0, gaps: [] },
    state: { score: 0, gaps: [] },
    memory: { score: 0, gaps: [] },
    constraints: { score: 0, gaps: [] },
  };
}

describe('scoreRepo — structure', () => {
  it('returns all 5 subsystems', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    expect(result).toHaveProperty('identity');
    expect(result).toHaveProperty('verification');
    expect(result).toHaveProperty('state');
    expect(result).toHaveProperty('memory');
    expect(result).toHaveProperty('constraints');
  });

  it('returns overall score', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    expect(typeof result.overall).toBe('number');
    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('includes crossRef in result', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    expect(result).toHaveProperty('crossRef');
    expect(result.crossRef).toHaveProperty('checks');
  });

  it('each subsystem has score, gaps, and files', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    for (const key of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
      expect(typeof result[key].score).toBe('number');
      expect(Array.isArray(result[key].gaps)).toBe(true);
      expect(Array.isArray(result[key].files)).toBe(true);
    }
  });
});

describe('scoreRepo — LLM scores are reflected', () => {
  it('uses LLM score for identity', async () => {
    const provider = makeProvider({
      ...allZeroScores(),
      identity: { score: 85, gaps: ['Need version'] },
    });
    const result = await scoreRepo(makeFiles(), [], provider);
    expect(result.identity.score).toBe(85);
    expect(result.identity.gaps).toContain('Need version');
  });

  it('clamps score to 0-100', async () => {
    const provider = makeProvider({ ...allZeroScores(), verification: { score: 150, gaps: [] } });
    const result = await scoreRepo(makeFiles(), [], provider);
    expect(result.verification.score).toBe(100);
  });

  it('overall is average of 5 subsystem scores', async () => {
    const provider = makeProvider({
      identity: { score: 80, gaps: [] },
      verification: { score: 60, gaps: [] },
      state: { score: 40, gaps: [] },
      memory: { score: 100, gaps: [] },
      constraints: { score: 70, gaps: [] },
    });
    const result = await scoreRepo(makeFiles(), [], provider);
    expect(result.overall).toBe(70); // (80+60+40+100+70)/5
  });
});

describe('scoreRepo — file attribution', () => {
  it('includes mapped file paths in subsystem.files', async () => {
    const provider = makeProvider({ ...allZeroScores(), identity: { score: 80, gaps: [] } });
    const mdFiles = [
      { path: 'AGENTS.md', name: 'AGENTS.md', preview: '# Agents', fullContent: '# Agents\nContent' },
    ];
    const mappings: FileMapping[] = [{ path: 'AGENTS.md', subsystems: ['identity'] }];
    const result = await scoreRepo(makeFiles({ mdFiles }), mappings, provider);
    expect(result.identity.files).toContain('AGENTS.md');
  });

  it('files is empty when no files are mapped to subsystem', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    expect(result.identity.files).toHaveLength(0);
  });
});

describe('scoreRepo — provider interaction', () => {
  it('calls provider.chat with fast: false', async () => {
    const provider = makeProvider(allZeroScores());
    await scoreRepo(makeFiles(), [], provider);
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { fast: false },
    );
  });

  it('returns 0 scores when provider returns invalid JSON', async () => {
    const provider: LLMProvider = {
      chat: vi.fn().mockResolvedValue('sorry, cannot help'),
      getTotalTokens: () => 0,
    };
    const result = await scoreRepo(makeFiles(), [], provider);
    expect(result.identity.score).toBe(0);
    expect(result.overall).toBe(0);
  });
});

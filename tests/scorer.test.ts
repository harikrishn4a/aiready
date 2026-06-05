import { describe, it, expect, vi } from 'vitest';
import {
  scoreRepo,
  scoreMakefileStructure,
  scoreShellStructure,
  scoreJsonStructure,
  scoreArchitectureStructure,
  scoreStructural,
  combineScores,
} from '../src/audit/scorer';
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
    usedGraphify: false,
    graphifyPath: null,
    guaranteedFiles: [],
    conceptMatchedFiles: [],
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
    identity: { score: 0, findings: [{ type: 'fail', message: 'No files' }] },
    verification: { score: 0, findings: [] },
    state: { score: 0, findings: [] },
    memory: { score: 0, findings: [] },
    constraints: { score: 0, findings: [] },
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
      identity: { score: 85, is_harness_artifact: true, findings: [{ type: 'warn', message: 'Need version' }] },
    });
    const mdFiles = [{ path: 'AGENTS.md', name: 'AGENTS.md', preview: '', fullContent: '# Agents\n\nContent here.' }];
    const mappings: FileMapping[] = [{ path: 'AGENTS.md', subsystems: ['identity'] }];
    const result = await scoreRepo(makeFiles({ mdFiles }), mappings, provider);
    expect(result.identity.contentScore).toBe(85);
    expect(result.identity.gaps).toContain('Need version');
  });

  it('clamps score to 0-100', async () => {
    const provider = makeProvider({ ...allZeroScores(), verification: { score: 150, findings: [] } });
    const mdFiles = [{ path: 'Makefile', name: 'Makefile', preview: '', fullContent: 'build:\n\techo ok' }];
    const mappings: FileMapping[] = [{ path: 'Makefile', subsystems: ['verification'] }];
    const result = await scoreRepo(makeFiles({ mdFiles }), mappings, provider);
    expect(result.verification.contentScore).toBe(100);
  });

  it('overall is average of 5 subsystem scores', async () => {
    const provider = makeProvider({
      identity: { score: 80, findings: [] },
      verification: { score: 60, findings: [] },
      state: { score: 40, findings: [] },
      memory: { score: 100, findings: [] },
      constraints: { score: 70, findings: [] },
    });
    const result = await scoreRepo(makeFiles(), [], provider);
    const expected = Math.round(
      (result.identity.score + result.verification.score + result.state.score +
       result.memory.score + result.constraints.score) / 5,
    );
    expect(result.overall).toBe(expected);
  });
});

describe('scoreRepo — file attribution', () => {
  it('includes mapped file paths in subsystem.files', async () => {
    const provider = makeProvider({ ...allZeroScores(), identity: { score: 80, findings: [] } });
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

  it('allows constraints sections inside agent entry files', async () => {
    const provider = makeProvider(allZeroScores());
    await scoreRepo(makeFiles(), [], provider);
    const systemPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(systemPrompt).toContain('SCORING RULES');
    expect(systemPrompt).toContain('constraints content exists inside AGENTS.md / CLAUDE.md');
    expect(systemPrompt).toContain('do not return 0');
    expect(systemPrompt).toContain('Partial credit when content is present in a non-canonical file');
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

describe('scoreMakefileStructure', () => {
  it('returns 100 when all required targets are present', () => {
    const content = 'setup:\n\techo setup\ndev:\n\techo dev\ncheck:\n\techo check\ntest:\n\techo test\nlint:\n\techo lint\nclean:\n\techo clean\n';
    const result = scoreMakefileStructure(content);
    expect(result.score).toBe(100);
    expect(result.present).toContain('setup');
    expect(result.present).toContain('dev');
    expect(result.missing).toHaveLength(0);
  });

  it('returns 0 when no targets are present', () => {
    const result = scoreMakefileStructure('# just a comment\nSOME_VAR = value\n');
    expect(result.score).toBe(0);
    expect(result.present).toHaveLength(0);
  });

  it('accepts verify as alias for check', () => {
    const content = 'setup:\ndev:\nverify:\ntest:\nlint:\nclean:\n';
    const result = scoreMakefileStructure(content);
    expect(result.score).toBe(100);
    expect(result.present).toContain('verify');
  });

  it('scores partial presence correctly', () => {
    const content = 'setup:\ntest:\nlint:\n';
    const result = scoreMakefileStructure(content);
    expect(result.score).toBe(50); // 3 of 6
    expect(result.present).toHaveLength(3);
    expect(result.missing).toHaveLength(3);
  });
});

describe('scoreShellStructure', () => {
  it('scores init.sh by REQUIRED_INIT_SH_PATTERNS', () => {
    const content = 'npm install\n./scripts/verify.sh\n';
    const result = scoreShellStructure('scripts/init.sh', content);
    expect(result.score).toBe(100);
    expect(result.present).toHaveLength(2);
    expect(result.missing).toHaveLength(0);
  });

  it('returns partial score when only install pattern matches', () => {
    const result = scoreShellStructure('init.sh', 'npm install\n');
    expect(result.score).toBe(50);
    expect(result.present).toHaveLength(1);
  });

  it('scores verify.sh by REQUIRED_VERIFY_SH_PATTERNS', () => {
    const content = 'npm run build\nnpm test\neslint src/\n';
    const result = scoreShellStructure('scripts/verify.sh', content);
    expect(result.score).toBe(100);
    expect(result.present).toHaveLength(3);
  });

  it('returns 0 for verify.sh with no matching patterns', () => {
    const result = scoreShellStructure('verify.sh', '#!/bin/bash\necho done\n');
    expect(result.score).toBe(0);
  });
});

describe('scoreJsonStructure', () => {
  it('scores feature_list.json by required keys', () => {
    const content = JSON.stringify({ project: 'x', features: [], rules: [] });
    const result = scoreJsonStructure('feature_list.json', content);
    expect(result.score).toBe(100);
    expect(result.present).toContain('features');
  });

  it('returns partial score when some keys missing', () => {
    const content = JSON.stringify({ project: 'x' });
    const result = scoreJsonStructure('feature_list.json', content);
    expect(result.score).toBe(33); // 1 of 3
    expect(result.missing).toContain('features');
    expect(result.missing).toContain('rules');
  });

  it('returns 0 for invalid JSON', () => {
    const result = scoreJsonStructure('feature_list.json', '{bad json');
    expect(result.score).toBe(0);
  });

  it('returns 100 for unknown JSON files (no required keys defined)', () => {
    const result = scoreJsonStructure('package.json', '{"name":"x"}');
    expect(result.score).toBe(100);
  });
});

describe('scoreArchitectureStructure', () => {
  const fullContent = `# Architecture
## Responsibilities
Each module has one job.
Must NOT cross module boundaries.
| Module | Role | Owner |
|---|---|---|
| audit | scoring | core |
Data flows from loader → mapper → scorer.
`;

  it('returns 100 when all four patterns are present', () => {
    const result = scoreArchitectureStructure(fullContent);
    expect(result.score).toBe(100);
    expect(result.present).toHaveLength(4);
  });

  it('returns 0 when content is empty', () => {
    const result = scoreArchitectureStructure('');
    expect(result.score).toBe(0);
    expect(result.missing).toHaveLength(4);
  });

  it('returns partial score for partial matches', () => {
    const content = 'Responsibilities are defined here.\n| a | b | c |\n';
    const result = scoreArchitectureStructure(content);
    expect(result.score).toBe(50); // 2 of 4
    expect(result.present).toContain('Responsibilities sections');
    expect(result.present).toContain('Module map or table');
  });
});

describe('scoreStructural — dispatch', () => {
  it('dispatches Makefile to scoreMakefileStructure', () => {
    const result = scoreStructural('Makefile', 'setup:\ndev:\ncheck:\ntest:\nlint:\nclean:\n', []);
    expect(result.score).toBe(100);
  });

  it('dispatches .sh to scoreShellStructure', () => {
    const result = scoreStructural('scripts/init.sh', 'npm install\n./scripts/verify.sh\n', []);
    expect(result.score).toBe(100);
  });

  it('dispatches architecture.md to scoreArchitectureStructure', () => {
    const content = 'Responsibilities\nMust NOT\n| a | b |\n→ data flow\n';
    const result = scoreStructural('architecture.md', content, []);
    expect(result.score).toBe(100);
  });

  it('dispatches other .md to markdown heading scorer', () => {
    const result = scoreStructural('progress.md', '## Current State\n## Completed\n', ['Current State', 'Completed']);
    expect(result.score).toBe(100);
  });
});

describe('combineScores', () => {
  it('weights structural at 40% and content at 60%', () => {
    expect(combineScores(100, 100)).toBe(100);
    expect(combineScores(0, 100)).toBe(60);
    expect(combineScores(100, 0)).toBe(40);
    expect(combineScores(50, 50)).toBe(50);
  });
});

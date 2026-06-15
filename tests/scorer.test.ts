import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scoreRepo, checkVerificationBaseline } from '../src/audit/scorer';
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
    identity: { score: 0, gaps: [], findings: [{ type: 'fail', message: 'No files' }] },
    verification: { score: 0, gaps: [], findings: [] },
    state: { score: 0, gaps: [], findings: [] },
    memory: { score: 0, gaps: [], findings: [] },
    constraints: { score: 0, gaps: [], findings: [] },
  };
}

function withFile(path: string, content: string): { files: Partial<RepoFiles>; mappings: FileMapping[] } {
  return {
    files: { mdFiles: [{ path, name: path, preview: '', fullContent: content }] },
    mappings: [{ path, subsystems: ['identity'] }],
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

  it('each subsystem has score, gaps, findings, and files', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    for (const key of ['identity', 'verification', 'state', 'memory', 'constraints'] as const) {
      expect(typeof result[key].score).toBe('number');
      expect(Array.isArray(result[key].gaps)).toBe(true);
      expect(Array.isArray(result[key].findings)).toBe(true);
      expect(Array.isArray(result[key].files)).toBe(true);
    }
  });
});

describe('scoreRepo — intent-based scoring', () => {
  it('returns intent-based scores without structural weighting', async () => {
    const provider = makeProvider({
      identity:     { score: 85, gaps: [], findings: [] },
      verification: { score: 80, gaps: [], findings: [] },
      state:        { score: 80, gaps: [], findings: [] },
      memory:       { score: 75, gaps: [], findings: [] },
      constraints:  { score: 80, gaps: [], findings: [] },
    });
    const { files, mappings } = withFile('AGENTS.md', '# Agents\nContent here.');
    const result = await scoreRepo(makeFiles(files), mappings, provider);
    expect(result.identity.score).toBe(85);
  });

  it('uses the raw LLM score directly (no 40/60 blend)', async () => {
    const provider = makeProvider({
      ...allZeroScores(),
      identity: { score: 85, gaps: [], findings: [{ type: 'warn', message: 'Need version' }] },
    });
    const { files, mappings } = withFile('AGENTS.md', '# Agents\n\nContent here.');
    const result = await scoreRepo(makeFiles(files), mappings, provider);
    expect(result.identity.score).toBe(85);
    expect(result.identity.gaps).toBeDefined();
    expect(result.identity.findings.some((f) => f.message === 'Need version')).toBe(true);
  });

  it('clamps LLM score to 0-100', async () => {
    const provider = makeProvider({ ...allZeroScores(), identity: { score: 150, gaps: [], findings: [] } });
    const { files, mappings } = withFile('AGENTS.md', '# Agents\nContent.');
    const result = await scoreRepo(makeFiles(files), mappings, provider);
    expect(result.identity.score).toBe(100);
  });

  it('returns 0 for subsystem with no mapped files', async () => {
    const result = await scoreRepo(makeFiles(), [], makeProvider(allZeroScores()));
    expect(result.identity.score).toBe(0);
    expect(result.identity.gaps).toContain('No file found serving this subsystem');
  });

  it('SubsystemScore no longer has structuralScore or contentScore', async () => {
    const { files, mappings } = withFile('AGENTS.md', '# Agents\nContent.');
    const result = await scoreRepo(
      makeFiles(files),
      mappings,
      makeProvider({ ...allZeroScores(), identity: { score: 80, gaps: [], findings: [] } }),
    );
    expect('structuralScore' in result.identity).toBe(false);
    expect('contentScore' in result.identity).toBe(false);
    expect('presentSections' in result.identity).toBe(false);
    expect('missingSections' in result.identity).toBe(false);
    expect('isHarnessArtifact' in result.identity).toBe(false);
  });

  it('overall is average of 5 subsystem scores', async () => {
    const provider = makeProvider({
      identity: { score: 80, gaps: [], findings: [] },
      verification: { score: 60, gaps: [], findings: [] },
      state: { score: 40, gaps: [], findings: [] },
      memory: { score: 100, gaps: [], findings: [] },
      constraints: { score: 70, gaps: [], findings: [] },
    });
    const result = await scoreRepo(makeFiles(), [], provider);
    const expected = Math.round(
      (result.identity.score + result.verification.score + result.state.score +
       result.memory.score + result.constraints.score) / 5,
    );
    expect(result.overall).toBe(expected);
  });
});

describe('scoreRepo — non-markdown harness artifacts', () => {
  let tmpDir: string;
  afterEach(() => { try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ } });

  it('feeds the Makefile content to the scorer for verification', async () => {
    tmpDir = join(tmpdir(), `aiready-nonmd-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tpytest\nlint:\n\truff check .\n');

    const provider = makeProvider(allZeroScores());
    const result = await scoreRepo(makeFiles({ targetDir: tmpDir }), [], provider);
    const userPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(userPrompt).toContain('=== Makefile ===');
    expect(userPrompt).toContain('pytest');
    expect(result.verification.files).toContain('Makefile');
  });

  it('feeds feature_list.json to the scorer for state', async () => {
    tmpDir = join(tmpdir(), `aiready-nonmd2-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'feature_list.json'), '{"project":"x","features":[]}');

    const provider = makeProvider(allZeroScores());
    const result = await scoreRepo(makeFiles({ targetDir: tmpDir }), [], provider);
    expect(result.state.files).toContain('feature_list.json');
  });
});

describe('scoreRepo — verification baseline', () => {
  let tmpDir: string;

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('verification includes baselineStatus and baseline findings', async () => {
    tmpDir = join(tmpdir(), `aiready-scorer-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tnpm test\n');

    const provider = makeProvider({
      ...allZeroScores(),
      verification: { score: 70, gaps: [], findings: [] },
    });
    const result = await scoreRepo(makeFiles({ targetDir: tmpDir }), [], provider);
    expect(result.verification.baselineStatus).toBeDefined();
    expect(result.verification.findings.some((f) =>
      f.message.includes('Runnable') || f.message.includes('make'),
    )).toBe(true);
  });

  it('verification score comes from the LLM, not the baseline', async () => {
    tmpDir = join(tmpdir(), `aiready-scorer-${Date.now()}-2`);
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tnpm test\n');

    const provider = makeProvider({
      ...allZeroScores(),
      verification: { score: 42, gaps: [], findings: [] },
    });
    const result = await scoreRepo(makeFiles({ targetDir: tmpDir }), [], provider);
    expect(result.verification.score).toBe(42);
  });
});

describe('scoreRepo — provider interaction', () => {
  it('calls provider.chat with fast: false and deterministic settings', async () => {
    const provider = makeProvider(allZeroScores());
    await scoreRepo(makeFiles(), [], provider);
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      { fast: false, temperature: 0, seed: 7, maxTokens: 4096 },
    );
  });

  it('shows a dedicated subsystem file even when a large entry file is also mapped', async () => {
    const provider = makeProvider(allZeroScores());
    const bigAgents = '# AGENTS\n' + 'x'.repeat(8000) + '\nSee CONSTRAINTS.md';
    const mdFiles = [
      { path: 'AGENTS.md', name: 'AGENTS.md', preview: '', fullContent: bigAgents },
      { path: 'docs/CONSTRAINTS.md', name: 'CONSTRAINTS.md', preview: '', fullContent: '# Constraints\nMUST NOT delete prod data.' },
    ];
    const mappings: FileMapping[] = [
      { path: 'AGENTS.md', subsystems: ['constraints'] },
      { path: 'docs/CONSTRAINTS.md', subsystems: ['constraints'] },
    ];
    await scoreRepo(makeFiles({ mdFiles }), mappings, provider);
    const userPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(userPrompt).toContain('=== docs/CONSTRAINTS.md ===');
    expect(userPrompt).toContain('MUST NOT delete prod data.');
    // dedicated file appears before the bulky entry file
    expect(userPrompt.indexOf('docs/CONSTRAINTS.md')).toBeLessThan(userPrompt.indexOf('=== AGENTS.md ==='));
  });

  it('uses the intent-based scoring system prompt', async () => {
    const provider = makeProvider(allZeroScores());
    await scoreRepo(makeFiles(), [], provider);
    const systemPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(systemPrompt).toContain('Can an AI coding agent do its job using only what is documented here?');
    expect(systemPrompt).toContain('Ignore file names, heading names, and structural conventions');
    expect(systemPrompt).toContain('workflow doc or changelog scores max 20');
  });

  it('retries once when the first scoring response is unparseable', async () => {
    const chat = vi.fn()
      .mockResolvedValueOnce('sorry, here is no json')
      .mockResolvedValueOnce(JSON.stringify({ ...allZeroScores(), identity: { score: 77, gaps: [], findings: [] } }));
    const provider: LLMProvider = { chat, getTotalTokens: () => 0 };
    const { files, mappings } = withFile('AGENTS.md', '# Agents\nContent.');
    const result = await scoreRepo(makeFiles(files), mappings, provider);
    expect(chat).toHaveBeenCalledTimes(2);
    expect(result.identity.score).toBe(77);
  });

  it('returns 0 for non-verification subsystems when provider returns invalid JSON', async () => {
    const provider: LLMProvider = {
      chat: vi.fn().mockResolvedValue('sorry, cannot help'),
      getTotalTokens: () => 0,
    };
    const result = await scoreRepo(makeFiles(), [], provider);
    expect(result.identity.score).toBe(0);
    expect(result.state.score).toBe(0);
    expect(result.verification.score).toBe(0);
  });
});

describe('checkVerificationBaseline', () => {
  let tmpDir: string;

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  function makeTmp(): string {
    const dir = join(tmpdir(), `aiready-test-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  it('status=established when Makefile has check, AGENTS.md documents it and cross-refs', async () => {
    tmpDir = makeTmp();
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tnpm test\n');
    const agentsMd = '## Verification commands\nRun `make check` to verify. See Makefile for details.';
    const result = await checkVerificationBaseline(tmpDir, agentsMd, null);
    expect(result.status).toBe('established');
    expect(result.runnableCommand).toBe('make check');
    expect(result.commandExists).toBe(true);
    expect(result.documented).toBe(true);
    expect(result.crossRefsValid).toBe(true);
  });

  it('status=partial when Makefile has check but AGENTS.md does not document it', async () => {
    tmpDir = makeTmp();
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tnpm test\n');
    const result = await checkVerificationBaseline(tmpDir, '# No mention of commands', null);
    expect(result.status).toBe('partial');
    expect(result.commandExists).toBe(true);
    expect(result.documented).toBe(false);
  });

  it('status=missing when no Makefile, no verify.sh, no npm test script', async () => {
    tmpDir = makeTmp();
    const result = await checkVerificationBaseline(tmpDir, null, null);
    expect(result.status).toBe('missing');
    expect(result.commandExists).toBe(false);
    expect(result.runnableCommand).toBeNull();
  });

  it('uses verify alias when Makefile has verify but not check', async () => {
    tmpDir = makeTmp();
    writeFileSync(join(tmpDir, 'Makefile'), 'setup:\n\techo setup\nverify:\n\tnpm test\n');
    const result = await checkVerificationBaseline(tmpDir, null, null);
    expect(result.runnableCommand).toBe('make verify');
    expect(result.commandExists).toBe(true);
  });

  it('falls back to verify.sh when no Makefile with check/verify/test', async () => {
    tmpDir = makeTmp();
    mkdirSync(join(tmpDir, 'scripts'));
    writeFileSync(join(tmpDir, 'scripts/verify.sh'), '#!/bin/bash\nnpm test\n');
    const result = await checkVerificationBaseline(tmpDir, null, null);
    expect(result.runnableCommand).toBe('./scripts/verify.sh');
    expect(result.commandExists).toBe(true);
  });

  it('falls back to npm test when packageJsonScripts has test', async () => {
    tmpDir = makeTmp();
    const result = await checkVerificationBaseline(tmpDir, null, { test: 'vitest run' });
    expect(result.runnableCommand).toBe('npm test');
    expect(result.commandExists).toBe(true);
  });

  it('includes a pass finding for runnable command', async () => {
    tmpDir = makeTmp();
    writeFileSync(join(tmpDir, 'Makefile'), 'check:\n\tnpm test\n');
    const result = await checkVerificationBaseline(tmpDir, null, null);
    const passFinding = result.findings.find((f) => f.type === 'pass' && f.message.includes('make check'));
    expect(passFinding).toBeDefined();
  });

  it('includes a fail finding when no command exists', async () => {
    tmpDir = makeTmp();
    const result = await checkVerificationBaseline(tmpDir, null, null);
    const failFinding = result.findings.find((f) => f.type === 'fail');
    expect(failFinding).toBeDefined();
    expect(failFinding?.message).toContain('No runnable verification command');
  });
});

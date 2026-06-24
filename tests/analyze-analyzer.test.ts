import { describe, it, expect, vi } from 'vitest';
import type { LLMProvider } from '../src/utils/llm';
import type { SourceFile, SourceFiles } from '../src/analyze/loader';
import {
  buildHarnessText,
  parseSemanticResponse,
  runStructuralPass,
  runSemanticPass,
  analyzeGaps,
} from '../src/analyze/analyzer';
import type { RepoFiles } from '../src/audit/loader';

function mockProvider(responses: string[]): LLMProvider {
  let idx = 0;
  return {
    chat: vi.fn().mockImplementation(() => Promise.resolve(responses[idx++] ?? '{}')),
    getTotalTokens: () => 0,
  };
}

function makeSourceFile(path: string, moduleName?: string): SourceFile {
  const name = path.split('/').pop() ?? path;
  const ext = name.includes('.') ? `.${name.split('.').pop()}` : '';
  return {
    path,
    name,
    ext,
    moduleName: moduleName ?? name.replace(/\.[^.]+$/, ''),
    fullContent: `# ${name}\ndef main(): pass`,
  };
}

function makeHarness(overrides: Partial<RepoFiles> = {}): RepoFiles {
  return {
    mdFiles: [],
    usedGraphify: false,
    graphifyPath: null,
    guaranteedFiles: [],
    conceptMatchedFiles: [],
    seedFiles: [],
    ignoredDuplicates: [],
    agentsMd: 'Agent instructions. Uses pipeline and embedder.',
    architectureMd: 'Architecture. Modules: pipeline, embedder, retriever.',
    constraintsMd: 'MUST NOT change embedder model.',
    progressMd: null,
    sessionHandoffMd: null,
    packageJsonRaw: null,
    packageJson: null,
    srcDirs: [],
    rootFiles: [],
    progressMdModifiedAt: null,
    targetDir: '/tmp/test',
    ...overrides,
  } as unknown as RepoFiles;
}

function makeSourceFiles(all: SourceFile[], relevant?: SourceFile[]): SourceFiles {
  return {
    all,
    relevant: relevant ?? all,
    usedGraphify: false,
    detectedExtensions: new Set(['.py', '.ts']),
  };
}

describe('buildHarnessText', () => {
  it('includes all three doc sections when present', () => {
    const text = buildHarnessText({
      architectureMd: 'arch content',
      agentsMd: 'agents content',
      constraintsMd: 'constraints content',
    });
    expect(text).toContain('arch content');
    expect(text).toContain('agents content');
    expect(text).toContain('constraints content');
  });

  it('caps architectureMd at 3000 chars', () => {
    const text = buildHarnessText({
      architectureMd: 'a'.repeat(5000),
      agentsMd: null,
      constraintsMd: null,
    });
    expect(text.length).toBeLessThanOrEqual(3100); // cap + label
  });

  it('handles null fields gracefully', () => {
    const text = buildHarnessText({ architectureMd: null, agentsMd: null, constraintsMd: null });
    expect(text).toBe('');
  });
});

describe('parseSemanticResponse', () => {
  it('returns null for non-JSON text', () => {
    expect(parseSemanticResponse('no json here')).toBeNull();
  });

  it('returns null when has_gap is false', () => {
    expect(parseSemanticResponse('{"has_gap": false}')).toBeNull();
  });

  it('parses a valid gap response', () => {
    const json = JSON.stringify({
      has_gap: true,
      gap_type: 'undocumented-module',
      summary: 'Module not in docs',
      severity: 'high',
      proposed_doc: '"""\\nDoc block.\\n"""',
    });
    const result = parseSemanticResponse(json);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('undocumented-module');
    expect(result!.severity).toBe('high');
    expect(result!.proposedDoc).toContain('Doc block');
  });

  it('defaults unknown gap_type to undocumented-module', () => {
    const json = JSON.stringify({ has_gap: true, gap_type: 'unknown-type', summary: 'x', severity: 'high' });
    expect(parseSemanticResponse(json)!.type).toBe('undocumented-module');
  });

  it('defaults unknown severity to medium', () => {
    const json = JSON.stringify({ has_gap: true, gap_type: 'missing-behavior', summary: 'x', severity: 'extreme' });
    expect(parseSemanticResponse(json)!.severity).toBe('medium');
  });

  it('returns null for empty JSON object', () => {
    expect(parseSemanticResponse('{}')).toBeNull();
  });
});

describe('runStructuralPass', () => {
  it('flags modules not mentioned in harness text', () => {
    const files = [makeSourceFile('utils/unknown_module.py')];
    const findings = runStructuralPass(files, 'architecture docs about pipeline only');
    expect(findings).toHaveLength(1);
    expect(findings[0].module).toBe('utils/unknown_module.py');
    expect(findings[0].detectedBy).toBe('structural');
    expect(findings[0].type).toBe('undocumented-module');
  });

  it('does not flag modules that appear in harness text', () => {
    const files = [makeSourceFile('utils/pipeline.py')];
    const findings = runStructuralPass(files, 'The pipeline module handles orchestration.');
    expect(findings).toHaveLength(0);
  });

  it('is case-insensitive', () => {
    const files = [makeSourceFile('utils/Pipeline.py')];
    const findings = runStructuralPass(files, 'the pipeline orchestrates everything');
    expect(findings).toHaveLength(0);
  });

  it('never calls an LLM (no async, pure function)', () => {
    const files = [makeSourceFile('src/foo.ts')];
    // Just verify it's synchronous and returns immediately
    const result = runStructuralPass(files, 'some docs');
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty array when all modules are mentioned', () => {
    const files = [makeSourceFile('utils/embedder.py'), makeSourceFile('utils/pipeline.py')];
    const harness = 'embedder is documented here. pipeline handles orchestration.';
    expect(runStructuralPass(files, harness)).toHaveLength(0);
  });
});

describe('runSemanticPass', () => {
  it('calls provider.chat once per relevant file', async () => {
    const files = [makeSourceFile('utils/a.py'), makeSourceFile('utils/b.py')];
    const provider = mockProvider([
      JSON.stringify({ has_gap: true, gap_type: 'undocumented-module', summary: 's', severity: 'high', proposed_doc: 'doc' }),
      JSON.stringify({ has_gap: false }),
    ]);
    await runSemanticPass(files, 'harness', provider);
    expect(provider.chat).toHaveBeenCalledTimes(2);
  });

  it('passes temperature: 0 and seed: 7', async () => {
    const files = [makeSourceFile('utils/a.py')];
    const provider = mockProvider([JSON.stringify({ has_gap: false })]);
    await runSemanticPass(files, 'harness', provider);
    expect(provider.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ temperature: 0, seed: 7 }),
    );
  });

  it('returns empty array when all responses have has_gap: false', async () => {
    const files = [makeSourceFile('utils/a.py'), makeSourceFile('utils/b.py')];
    const provider = mockProvider([
      JSON.stringify({ has_gap: false }),
      JSON.stringify({ has_gap: false }),
    ]);
    const findings = await runSemanticPass(files, 'harness', provider);
    expect(findings).toHaveLength(0);
  });

  it('returns empty array on unparseable JSON without throwing', async () => {
    const files = [makeSourceFile('utils/a.py')];
    const provider = mockProvider(['not json at all']);
    const findings = await runSemanticPass(files, 'harness', provider);
    expect(findings).toHaveLength(0);
  });

  it('sets module path from file path', async () => {
    const files = [makeSourceFile('app/service.py')];
    const provider = mockProvider([
      JSON.stringify({ has_gap: true, gap_type: 'undocumented-module', summary: 's', severity: 'high', proposed_doc: '' }),
    ]);
    const findings = await runSemanticPass(files, 'harness', provider);
    expect(findings[0].module).toBe('app/service.py');
  });
});

describe('analyzeGaps', () => {
  it('returns AnalysisResult with filesWalked and filesAnalyzed counts', async () => {
    const all = [makeSourceFile('utils/pipeline.py'), makeSourceFile('utils/unknown.py')];
    const relevant = [makeSourceFile('utils/pipeline.py')];
    const sourceFiles = makeSourceFiles(all, relevant);
    const harness = makeHarness();
    const provider = mockProvider([JSON.stringify({ has_gap: false })]);

    const result = await analyzeGaps(harness, sourceFiles, provider);
    expect(result.filesWalked).toBe(2);
    expect(result.filesAnalyzed).toBe(1);
  });

  it('semantic finding replaces structural finding for same module', async () => {
    const file = makeSourceFile('utils/unknown.py');
    const sourceFiles = makeSourceFiles([file], [file]);
    const harness = makeHarness({ architectureMd: 'no mention of unknown here', agentsMd: null, constraintsMd: null });
    const provider = mockProvider([
      JSON.stringify({
        has_gap: true, gap_type: 'missing-behavior', summary: 'behavior missing',
        severity: 'medium', proposed_doc: '"""doc"""',
      }),
    ]);

    const result = await analyzeGaps(harness, sourceFiles, provider);
    const f = result.findings.find((x) => x.module === 'utils/unknown.py');
    expect(f?.detectedBy).toBe('semantic');
    expect(f?.proposedDoc).toBe('"""doc"""');
  });

  it('structural finding retained when Level 2 returns has_gap: false', async () => {
    const file = makeSourceFile('utils/mystery.py');
    const sourceFiles = makeSourceFiles([file], [file]);
    const harness = makeHarness({ architectureMd: 'no mention', agentsMd: null, constraintsMd: null });
    const provider = mockProvider([JSON.stringify({ has_gap: false })]);

    const result = await analyzeGaps(harness, sourceFiles, provider);
    const f = result.findings.find((x) => x.module === 'utils/mystery.py');
    expect(f?.detectedBy).toBe('structural');
  });

  it('structural findings for non-relevant files are included', async () => {
    const pyFile = makeSourceFile('utils/py_only.py');
    const tsFile = makeSourceFile('src/ts_only.ts');
    // relevant only includes ts file; py file is structural-only
    const sourceFiles = makeSourceFiles([pyFile, tsFile], [tsFile]);
    const harness = makeHarness({ architectureMd: 'ts_only is documented', agentsMd: null, constraintsMd: null });
    const provider = mockProvider([JSON.stringify({ has_gap: false })]);

    const result = await analyzeGaps(harness, sourceFiles, provider);
    expect(result.findings.some((f) => f.module === 'utils/py_only.py')).toBe(true);
  });

  it('usedGraphify matches sourceFiles input', async () => {
    const sourceFiles: SourceFiles = {
      all: [],
      relevant: [],
      usedGraphify: true,
      detectedExtensions: new Set(['.ts']),
    };
    const provider = mockProvider([]);
    const result = await analyzeGaps(makeHarness(), sourceFiles, provider);
    expect(result.usedGraphify).toBe(true);
  });
});

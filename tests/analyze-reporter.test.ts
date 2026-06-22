import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reportAnalysis } from '../src/analyze/reporter';
import type { AnalysisResult, GapFinding } from '../src/analyze/analyzer';

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    findings: [],
    filesWalked: 10,
    filesAnalyzed: 5,
    usedGraphify: false,
    ...overrides,
  };
}

function structuralFinding(module = 'utils/foo.py'): GapFinding {
  return {
    type: 'undocumented-module',
    module,
    summary: 'Not mentioned in any doc.',
    proposedDoc: '',
    severity: 'high',
    detectedBy: 'structural',
  };
}

function semanticFinding(module = 'utils/bar.py', severity: GapFinding['severity'] = 'medium'): GapFinding {
  return {
    type: 'missing-behavior',
    module,
    summary: 'Behavior not documented.',
    proposedDoc: '"""Doc block."""',
    severity,
    detectedBy: 'semantic',
  };
}

describe('reportAnalysis', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      output += args.join(' ') + '\n';
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints no-gaps message when findings is empty', () => {
    reportAnalysis(makeResult(), '/tmp/gaps.md', 0, new Set(['.ts']));
    expect(output).toContain('No documentation gaps found');
  });

  it('prints structural gaps section with ✗ glyphs', () => {
    const result = makeResult({ findings: [structuralFinding('utils/foo.py')] });
    reportAnalysis(result, '/tmp/gaps.md', 0, new Set(['.py']));
    expect(output).toContain('✗');
    expect(output).toContain('utils/foo.py');
    expect(output).toContain('STRUCTURAL GAPS');
  });

  it('prints semantic gaps section with ⚠ glyphs', () => {
    const result = makeResult({ findings: [semanticFinding('utils/bar.py')] });
    reportAnalysis(result, '/tmp/gaps.md', 0, new Set(['.py']));
    expect(output).toContain('⚠');
    expect(output).toContain('utils/bar.py');
    expect(output).toContain('SEMANTIC GAPS');
  });

  it('prints total gap count', () => {
    const result = makeResult({ findings: [structuralFinding(), semanticFinding()] });
    reportAnalysis(result, '/tmp/gaps.md', 1500, new Set(['.py']));
    expect(output).toContain('2 gap(s) total');
  });

  it('prints token usage', () => {
    reportAnalysis(makeResult({ findings: [structuralFinding()] }), '/tmp/gaps.md', 5000, new Set(['.ts']));
    expect(output).toContain('~5k');
  });

  it('prints output path', () => {
    reportAnalysis(makeResult({ findings: [structuralFinding()] }), '/some/path/gaps.md', 0, new Set(['.ts']));
    expect(output).toContain('/some/path/gaps.md');
  });

  it('prints fix hint when gaps found', () => {
    reportAnalysis(makeResult({ findings: [structuralFinding()] }), '/tmp/gaps.md', 0, new Set(['.ts']));
    expect(output).toContain('npx aiready fix --gaps');
  });

  it('truncates structural list at 8 and shows overflow count', () => {
    const findings = Array.from({ length: 12 }, (_, i) => structuralFinding(`utils/mod${i}.py`));
    const result = makeResult({ findings });
    reportAnalysis(result, '/tmp/gaps.md', 0, new Set(['.py']));
    expect(output).toContain('... and 4 more');
  });

  it('shows Graphify: used when usedGraphify is true', () => {
    reportAnalysis(makeResult({ usedGraphify: true }), '/tmp/gaps.md', 0, new Set(['.ts']));
    expect(output).toContain('Graphify: used');
  });
});

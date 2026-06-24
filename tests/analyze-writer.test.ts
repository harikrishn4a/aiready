import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { renderGapsMd, writeGaps } from '../src/analyze/writer';
import type { AnalysisResult, GapFinding } from '../src/analyze/analyzer';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-analyze-writer-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function makeResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    findings: [],
    filesWalked: 10,
    filesAnalyzed: 5,
    usedGraphify: false,
    ...overrides,
  };
}

function makeFinding(overrides: Partial<GapFinding> = {}): GapFinding {
  return {
    type: 'undocumented-module',
    module: 'utils/foo.py',
    summary: 'Module not documented.',
    proposedDoc: '"""\\nFoo utility.\\n"""',
    severity: 'high',
    detectedBy: 'semantic',
    ...overrides,
  };
}

describe('writeGaps', () => {
  it('creates .aiready/ directory if it does not exist', () => {
    writeGaps(makeResult(), tmp);
    expect(existsSync(join(tmp, '.aiready'))).toBe(true);
  });

  it('writes gaps.md inside .aiready/', () => {
    writeGaps(makeResult(), tmp);
    expect(existsSync(join(tmp, '.aiready', 'gaps.md'))).toBe(true);
  });

  it('returns the absolute path to the written file', () => {
    const path = writeGaps(makeResult(), tmp);
    expect(path).toContain('.aiready');
    expect(path).toContain('gaps.md');
    expect(existsSync(path)).toBe(true);
  });

  it('writes a valid markdown file even with zero findings', () => {
    writeGaps(makeResult(), tmp);
    const content = readFileSync(join(tmp, '.aiready', 'gaps.md'), 'utf-8');
    expect(content).toContain('# AIReady Analysis');
  });
});

describe('renderGapsMd', () => {
  const now = new Date('2026-06-22T10:00:00Z');

  it('includes generated date', () => {
    const md = renderGapsMd(makeResult(), '/target', now);
    expect(md).toContain('2026-06-22');
  });

  it('includes target path', () => {
    const md = renderGapsMd(makeResult(), '/my/project', now);
    expect(md).toContain('/my/project');
  });

  it('shows no-gaps message when findings is empty', () => {
    const md = renderGapsMd(makeResult(), '/target', now);
    expect(md).toContain('No documentation gaps found');
  });

  it('includes finding module in heading', () => {
    const md = renderGapsMd(makeResult({ findings: [makeFinding()] }), '/target', now);
    expect(md).toContain('utils/foo.py');
  });

  it('groups findings by severity (high before medium before low)', () => {
    const findings = [
      makeFinding({ severity: 'low', module: 'a.py' }),
      makeFinding({ severity: 'high', module: 'b.py' }),
      makeFinding({ severity: 'medium', module: 'c.py' }),
    ];
    const md = renderGapsMd(makeResult({ findings }), '/target', now);
    const highIdx = md.indexOf('HIGH SEVERITY');
    const medIdx = md.indexOf('MEDIUM SEVERITY');
    const lowIdx = md.indexOf('LOW SEVERITY');
    expect(highIdx).toBeLessThan(medIdx);
    expect(medIdx).toBeLessThan(lowIdx);
  });

  it('includes proposedDoc when present', () => {
    const finding = makeFinding({ proposedDoc: '"""\\nFoo utility.\\n"""' });
    const md = renderGapsMd(makeResult({ findings: [finding] }), '/target', now);
    expect(md).toContain('Foo utility');
    expect(md).toContain('Proposed documentation');
  });

  it('shows run-fix prompt for structural-only gaps without proposedDoc', () => {
    const finding = makeFinding({ proposedDoc: '', detectedBy: 'structural' });
    const md = renderGapsMd(makeResult({ findings: [finding] }), '/target', now);
    expect(md).toContain('npx aiready fix --gaps');
  });

  it('uses python code block for .py files', () => {
    const finding = makeFinding({ module: 'utils/foo.py', proposedDoc: '"""doc"""' });
    const md = renderGapsMd(makeResult({ findings: [finding] }), '/target', now);
    expect(md).toContain('```python');
  });

  it('uses typescript code block for .ts files', () => {
    const finding = makeFinding({ module: 'src/app.ts', proposedDoc: '/** doc */' });
    const md = renderGapsMd(makeResult({ findings: [finding] }), '/target', now);
    expect(md).toContain('```typescript');
  });

  it('shows structural and semantic counts in summary', () => {
    const findings = [
      makeFinding({ detectedBy: 'structural', module: 'a.py' }),
      makeFinding({ detectedBy: 'semantic', module: 'b.py' }),
    ];
    const md = renderGapsMd(makeResult({ findings }), '/target', now);
    expect(md).toContain('1 structural');
    expect(md).toContain('1 semantic');
  });

  it('shows Graphify: used when usedGraphify is true', () => {
    const md = renderGapsMd(makeResult({ usedGraphify: true }), '/target', now);
    expect(md).toContain('Graphify: used');
  });
});

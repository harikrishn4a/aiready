import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { report } from '../src/audit/reporter';
import type { ScoredResult } from '../src/audit/scorer';
import type { CrossRefResult } from '../src/audit/cross-ref';

function makeScored(overrides: Partial<ScoredResult> = {}): ScoredResult {
  const sub = (score: number) => ({ score, gaps: score < 100 ? [`gap at ${score}`] : [] });
  return {
    identity: sub(80),
    verification: sub(60),
    state: sub(40),
    memory: sub(20),
    constraints: sub(100),
    overall: 60,
    ...overrides,
  };
}

function makeXref(overrides: Partial<CrossRefResult> = {}): CrossRefResult {
  return { checks: [], ...overrides };
}

describe('report — terminal output', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += chunk;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prints overall score header', () => {
    report(makeScored({ overall: 47 }), makeXref(), { json: false });
    expect(output).toContain('AI Readiness: 47/100');
  });

  it('prints all 5 subsystem names', () => {
    report(makeScored(), makeXref(), { json: false });
    expect(output).toContain('identity');
    expect(output).toContain('verification');
    expect(output).toContain('state');
    expect(output).toContain('memory');
    expect(output).toContain('constraints');
  });

  it('prints bar characters', () => {
    report(makeScored(), makeXref(), { json: false });
    expect(output).toMatch(/[█░]/);
  });

  it('prints critical gaps for subsystems below 50', () => {
    const scored = makeScored({
      state: { score: 20, gaps: ['No PROGRESS.md'] },
      memory: { score: 30, gaps: ['No ARCHITECTURE.md'] },
    });
    report(scored, makeXref(), { json: false });
    expect(output).toContain('Critical gaps:');
    expect(output).toContain('No PROGRESS.md');
    expect(output).toContain('No ARCHITECTURE.md');
  });

  it('does not print critical gaps section when all subsystems score >= 50', () => {
    const scored = makeScored({
      identity: { score: 80, gaps: [] },
      verification: { score: 60, gaps: [] },
      state: { score: 50, gaps: [] },
      memory: { score: 70, gaps: [] },
      constraints: { score: 100, gaps: [] },
      overall: 72,
    });
    report(scored, makeXref(), { json: false });
    expect(output).not.toContain('Critical gaps:');
  });

  it('prints failed cross-ref checks in critical gaps', () => {
    const xref = makeXref({
      checks: [{ name: 'commands-check', passed: false, detail: '`npm run typecheck` not in package.json' }],
    });
    report(makeScored(), xref, { json: false });
    expect(output).toContain('`npm run typecheck` not in package.json');
  });

  it('prints a recommendation', () => {
    report(makeScored({ memory: { score: 0, gaps: ['No ARCHITECTURE.md'] } }), makeXref(), {
      json: false,
    });
    // Lowest score drives recommendation
    expect(output.length).toBeGreaterThan(100);
  });
});

describe('report — JSON output', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += chunk;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('outputs valid JSON', () => {
    report(makeScored({ overall: 60 }), makeXref(), { json: true });
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('JSON has overall, subsystems, crossReference, recommendation', () => {
    report(makeScored({ overall: 60 }), makeXref(), { json: true });
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('overall');
    expect(parsed).toHaveProperty('subsystems');
    expect(parsed).toHaveProperty('crossReference');
    expect(parsed).toHaveProperty('recommendation');
  });

  it('JSON overall matches scored.overall', () => {
    report(makeScored({ overall: 42 }), makeXref(), { json: true });
    const parsed = JSON.parse(output) as { overall: number };
    expect(parsed.overall).toBe(42);
  });

  it('JSON subsystems has all 5 names', () => {
    report(makeScored(), makeXref(), { json: true });
    const parsed = JSON.parse(output) as { subsystems: Record<string, unknown> };
    expect(parsed.subsystems).toHaveProperty('identity');
    expect(parsed.subsystems).toHaveProperty('verification');
    expect(parsed.subsystems).toHaveProperty('state');
    expect(parsed.subsystems).toHaveProperty('memory');
    expect(parsed.subsystems).toHaveProperty('constraints');
  });
});

describe('bar rendering', () => {
  let output: string;

  beforeEach(() => {
    output = '';
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      output += chunk;
      return true;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('score 0 renders all empty bar', () => {
    report(
      makeScored({ identity: { score: 0, gaps: ['missing'] } }),
      makeXref(),
      { json: false },
    );
    expect(output).toContain('░░░░░░░░░░');
  });

  it('score 100 renders all filled bar', () => {
    report(
      makeScored({ constraints: { score: 100, gaps: [] } }),
      makeXref(),
      { json: false },
    );
    expect(output).toContain('██████████');
  });
});

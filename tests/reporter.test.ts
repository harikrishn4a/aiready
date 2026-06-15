import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { report } from '../src/audit/reporter';
import type { ScoredResult } from '../src/audit/scorer';

function makeScored(overrides: Partial<ScoredResult> = {}): ScoredResult {
  const sub = (score: number, files: string[] = []) => ({
    score,
    gaps: score < 100 ? [`gap at ${score}`] : [],
    findings: score < 100 ? [{ type: 'fail' as const, message: `gap at ${score}` }] : [],
    files,
  });
  return {
    identity: sub(80, ['AGENTS.md']),
    verification: sub(60, ['AGENTS.md']),
    state: sub(40, ['PROGRESS.md']),
    memory: sub(20, []),
    constraints: sub(100, ['AGENTS.md']),
    overall: 60,
    crossRef: { checks: [] },
    ...overrides,
  };
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
    report(makeScored({ overall: 47 }), { json: false });
    expect(output).toContain('AI Readiness: 47/100');
  });

  it('prints all 5 subsystem names', () => {
    report(makeScored(), { json: false });
    expect(output).toContain('IDENTITY');
    expect(output).toContain('VERIFICATION');
    expect(output).toContain('STATE');
    expect(output).toContain('MEMORY');
    expect(output).toContain('CONSTRAINTS');
  });

  it('prints bar characters', () => {
    report(makeScored(), { json: false });
    expect(output).toMatch(/[█░]/);
  });

  it('prints file names in output lines', () => {
    report(makeScored(), { json: false });
    expect(output).toContain('AGENTS.md');
  });

  it('prints subsystem details on separate lines', () => {
    report(makeScored(), { json: false });
    expect(output).toContain('IDENTITY');
    expect(output).toContain('  Files: AGENTS.md');
    expect(output).toContain('gap at 80');
  });

  it('prints (no files) when subsystem has no files', () => {
    report(makeScored(), { json: false });
    expect(output).toContain('(no files)');
  });

  it('prints critical gaps for subsystems below 50', () => {
    const scored = makeScored({
      state: { score: 20, gaps: ['No PROGRESS.md'], files: [] },
      memory: { score: 30, gaps: ['No ARCHITECTURE.md'], files: [] },
    });
    report(scored, { json: false });
    expect(output).toContain('Critical gaps:');
    expect(output).toContain('No PROGRESS.md');
    expect(output).toContain('No ARCHITECTURE.md');
  });

  it('does not print critical gaps section when all subsystems score >= 50', () => {
    const scored = makeScored({
      identity: { score: 80, gaps: [], files: [] },
      verification: { score: 60, gaps: [], files: [] },
      state: { score: 50, gaps: [], files: [] },
      memory: { score: 70, gaps: [], files: [] },
      constraints: { score: 100, gaps: [], files: [] },
      overall: 72,
    });
    report(scored, { json: false });
    expect(output).not.toContain('Critical gaps:');
  });

  it('prints failed cross-ref checks in critical gaps', () => {
    const scored = makeScored({
      crossRef: {
        checks: [{ name: 'cmd-check', passed: false, detail: '`npm run typecheck` not in package.json' }],
      },
    });
    report(scored, { json: false });
    expect(output).toContain('`npm run typecheck` not in package.json');
  });

  it('prints a recommendation', () => {
    report(makeScored({ memory: { score: 0, gaps: ['No ARCHITECTURE.md'], files: [] } }), { json: false });
    expect(output.length).toBeGreaterThan(100);
  });

  it('prints findings with glyphs for each subsystem', () => {
    report(makeScored({
      identity: {
        score: 70, gaps: ['needs version'], files: ['AGENTS.md'],
        findings: [
          { type: 'pass', message: 'Project description documented' },
          { type: 'warn', message: 'Stack versions not pinned' },
        ],
      },
    }), { json: false });
    expect(output).toContain('✓ Project description documented');
    expect(output).toContain('⚠ Stack versions not pinned');
  });

  it('no longer prints structural section coverage', () => {
    report(makeScored(), { json: false });
    expect(output).not.toContain('Sections:');
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
    report(makeScored({ overall: 60 }), { json: true });
    expect(() => JSON.parse(output)).not.toThrow();
  });

  it('JSON has overall, subsystems, crossReference, recommendation', () => {
    report(makeScored({ overall: 60 }), { json: true });
    const parsed = JSON.parse(output) as Record<string, unknown>;
    expect(parsed).toHaveProperty('overall');
    expect(parsed).toHaveProperty('subsystems');
    expect(parsed).toHaveProperty('crossReference');
    expect(parsed).toHaveProperty('recommendation');
  });

  it('JSON overall matches scored.overall', () => {
    report(makeScored({ overall: 42 }), { json: true });
    const parsed = JSON.parse(output) as { overall: number };
    expect(parsed.overall).toBe(42);
  });

  it('JSON subsystems has all 5 names', () => {
    report(makeScored(), { json: true });
    const parsed = JSON.parse(output) as { subsystems: Record<string, unknown> };
    expect(parsed.subsystems).toHaveProperty('identity');
    expect(parsed.subsystems).toHaveProperty('verification');
    expect(parsed.subsystems).toHaveProperty('state');
    expect(parsed.subsystems).toHaveProperty('memory');
    expect(parsed.subsystems).toHaveProperty('constraints');
  });

  it('JSON subsystems include files array', () => {
    report(makeScored(), { json: true });
    const parsed = JSON.parse(output) as { subsystems: { identity: { files: string[] } } };
    expect(Array.isArray(parsed.subsystems.identity.files)).toBe(true);
  });

  it('JSON includes token_usage when provided', () => {
    report(makeScored({ overall: 61 }), { json: true, tokenUsage: 8123 });
    const parsed = JSON.parse(output) as { token_usage: number; overall: number };
    expect(parsed.token_usage).toBe(8123);
    expect(parsed.overall).toBe(61);
  });

  it('JSON includes remediation when provided', () => {
    report(makeScored(), {
      json: true,
      remediation: {
        generated_at: '2026-06-05T00:00:00.000Z',
        target: '/repo',
        overall: 60,
        generate: [],
        improve: [],
        source_context: [],
      },
      planPath: '/repo/.aiready/plan.md',
    });
    const parsed = JSON.parse(output) as { remediation: unknown; plan_path: string };
    expect(parsed.remediation).toBeDefined();
    expect(parsed.plan_path).toBe('/repo/.aiready/plan.md');
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
      makeScored({ identity: { score: 0, gaps: ['missing'], files: [] } }),
      { json: false },
    );
    expect(output).toContain('░░░░░░░░░░');
  });

  it('score 100 renders all filled bar', () => {
    report(
      makeScored({ constraints: { score: 100, gaps: [], files: [] } }),
      { json: false },
    );
    expect(output).toContain('██████████');
  });
});

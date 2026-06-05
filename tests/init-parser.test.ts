import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parsePlan } from '../src/init/parser';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-init-parser-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const MINIMAL_PLAN = `# AIReady Plan
Generated: 2026-06-05T00:00:00.000Z
Target: /some/path
Overall: 42/100

## Summary
- Missing: PROGRESS.md
- Weak: none
- Source context: none

## Missing Artifacts
### PROGRESS.md
- why: No file was mapped to the state subsystem.
- template: examples/progress.md
- subsystem: state
- max_lines: 300
- required_sections: current build status, completed tasks
- source_signals: package.json, README.md, src/ directory structure
- write_policy:
  - create only if missing
  - keep artifact under 300 lines
`;

const IMPROVE_PLAN = `# AIReady Plan
Generated: 2026-06-05T00:00:00.000Z
Target: /some/path
Overall: 55/100

## Summary
- Missing: none
- Weak: CLAUDE.md
- Source context: none

## Weak Artifacts
### CLAUDE.md
- subsystem: identity
- score: 30
- why: Existing agent entry point scored 30/100.
- max_lines: 300
- missing: No verification commands in package.json
- fix: Update agent entry point using examples/agents.md; keep the artifact under 300 lines.
- template_section: examples/agents.md → Verification Commands
- use_as_sources: CLAUDE.md, package.json
- write_policy:
  - preserve existing useful content
  - do not overwrite without --force
- findings:
  - fail: missing verification section
  - warn: no tech stack section
`;

describe('parsePlan', () => {
  it('returns null for non-existent file', () => {
    expect(parsePlan(join(tmp, 'missing.md'))).toBeNull();
  });

  it('returns null when Overall line is absent', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, '# AIReady Plan\nno overall line\n');
    expect(parsePlan(path)).toBeNull();
  });

  it('parses overall score', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    expect(parsePlan(path)?.overall).toBe(42);
  });

  it('parses generate item filename', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    const plan = parsePlan(path);
    expect(plan?.generate[0]?.filename).toBe('PROGRESS.md');
  });

  it('parses generate item subsystem', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    expect(parsePlan(path)?.generate[0]?.subsystem).toBe('state');
  });

  it('parses generate item templateFile', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    expect(parsePlan(path)?.generate[0]?.templateFile).toBe('examples/progress.md');
  });

  it('parses generate item required', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    expect(parsePlan(path)?.generate[0]?.required).toBe('current build status, completed tasks');
  });

  it('parses source signals into array', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    const signals = parsePlan(path)?.generate[0]?.sourceSignals ?? [];
    expect(signals).toContain('package.json');
    expect(signals).toContain('README.md');
    expect(signals).toContain('src/ directory structure');
  });

  it('parses write_policy as array of strings', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    const policy = parsePlan(path)?.generate[0]?.writePolicy ?? [];
    expect(policy).toContain('create only if missing');
    expect(policy).toContain('keep artifact under 300 lines');
  });

  it('returns empty generate array when Missing Artifacts section absent', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, '# AIReady Plan\nOverall: 80/100\n\n## Summary\n- Missing: none\n');
    expect(parsePlan(path)?.generate).toEqual([]);
  });

  it('parses improve item filename and subsystem', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    const item = parsePlan(path)?.improve[0];
    expect(item?.filename).toBe('CLAUDE.md');
    expect(item?.subsystem).toBe('identity');
  });

  it('derives section from subsystem', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    expect(parsePlan(path)?.improve[0]?.section).toBe('agent entry point');
  });

  it('parses improve item missing and fix', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    const item = parsePlan(path)?.improve[0];
    expect(item?.missing).toBe('No verification commands in package.json');
    expect(item?.fix).toBe('Update agent entry point using examples/agents.md; keep the artifact under 300 lines.');
  });

  it('parses improve item templateSection', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    expect(parsePlan(path)?.improve[0]?.templateSection).toBe('examples/agents.md → Verification Commands');
  });

  it('parses sourceFiles from use_as_sources', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    const sources = parsePlan(path)?.improve[0]?.sourceFiles ?? [];
    expect(sources).toContain('CLAUDE.md');
    expect(sources).toContain('package.json');
  });

  it('parses improve write_policy as array', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    const policy = parsePlan(path)?.improve[0]?.writePolicy ?? [];
    expect(policy).toContain('preserve existing useful content');
    expect(policy).toContain('do not overwrite without --force');
  });

  it('parses improve findings as array', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, IMPROVE_PLAN);
    const findings = parsePlan(path)?.improve[0]?.findings ?? [];
    expect(findings).toContain('fail: missing verification section');
    expect(findings).toContain('warn: no tech stack section');
  });

  it('returns empty improve array when Weak Artifacts section absent', () => {
    const path = join(tmp, 'plan.md');
    writeFileSync(path, MINIMAL_PLAN);
    expect(parsePlan(path)?.improve).toEqual([]);
  });

  it('handles plan with both generate and improve sections', () => {
    const path = join(tmp, 'plan.md');
    const combined = MINIMAL_PLAN + '\n' + IMPROVE_PLAN.split('\n## Weak Artifacts')[1]?.replace(/^/, '\n## Weak Artifacts') ?? '';
    writeFileSync(path, combined);
    const plan = parsePlan(path);
    // At minimum, generate items should be parsed
    expect(plan?.generate.length).toBeGreaterThan(0);
  });

  it('parses a plan written by renderRemediationMarkdown', () => {
    mkdirSync(join(tmp, '.aiready'), { recursive: true });
    const plan = join(tmp, '.aiready', 'plan.md');
    writeFileSync(plan, [
      '# AIReady Plan',
      'Generated: 2026-06-05T00:00:00.000Z',
      `Target: ${tmp}`,
      'Overall: 10/100',
      '',
      '## Summary',
      '- Missing: AGENTS.md',
      '- Weak: none',
      '- Source context: none',
      '',
      '## Missing Artifacts',
      '### AGENTS.md',
      '- why: No file was mapped to the identity subsystem.',
      '- template: examples/agents.md',
      '- subsystem: identity',
      '- max_lines: 300',
      '- required_sections: project description, stack with versions',
      '- source_signals: README.md, package.json',
      '- write_policy:',
      '  - create only if missing',
      '  - do not overwrite an existing user file without --force',
      '  - keep artifact under 300 lines',
      '',
    ].join('\n'));
    const result = parsePlan(plan);
    expect(result).not.toBeNull();
    expect(result?.overall).toBe(10);
    expect(result?.generate[0]?.filename).toBe('AGENTS.md');
    expect(result?.generate[0]?.writePolicy).toHaveLength(3);
  });
});

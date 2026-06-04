import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadRepo } from '../src/audit/loader';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-test-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('loadRepo', () => {
  it('returns null for all files in an empty directory', () => {
    const r = loadRepo(tmp);
    expect(r.agentsMd).toBeNull();
    expect(r.architectureMd).toBeNull();
    expect(r.constraintsMd).toBeNull();
    expect(r.progressMd).toBeNull();
    expect(r.sessionHandoffMd).toBeNull();
    expect(r.packageJson).toBeNull();
    expect(r.packageJsonRaw).toBeNull();
    expect(r.srcDirs).toEqual([]);
    expect(r.rootFiles).toEqual([]);
    expect(r.progressMdModifiedAt).toBeNull();
  });

  it('reads AGENTS.md', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# Agent Guide\nThis is a test.');
    expect(loadRepo(tmp).agentsMd).toContain('Agent Guide');
  });

  it('falls back to lowercase agents.md', () => {
    writeFileSync(join(tmp, 'agents.md'), '# agents lowercase');
    expect(loadRepo(tmp).agentsMd).toContain('agents lowercase');
  });

  it('reads ARCHITECTURE.md', () => {
    writeFileSync(join(tmp, 'ARCHITECTURE.md'), '# Architecture');
    expect(loadRepo(tmp).architectureMd).toContain('Architecture');
  });

  it('reads CONSTRAINTS.md', () => {
    writeFileSync(join(tmp, 'CONSTRAINTS.md'), '# Constraints\nMUST NOT do X');
    expect(loadRepo(tmp).constraintsMd).toContain('MUST NOT');
  });

  it('reads PROGRESS.md', () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '## Completed\n- [x] setup');
    expect(loadRepo(tmp).progressMd).toContain('Completed');
  });

  it('reads SESSION-HANDOFF.md', () => {
    writeFileSync(join(tmp, 'SESSION-HANDOFF.md'), '## Next best step\n- start feat-001');
    expect(loadRepo(tmp).sessionHandoffMd).toContain('Next best step');
  });

  it('parses valid package.json', () => {
    const pkg = { name: 'test', version: '1.0.0', scripts: { build: 'tsc', test: 'vitest' } };
    writeFileSync(join(tmp, 'package.json'), JSON.stringify(pkg));
    const r = loadRepo(tmp);
    expect(r.packageJson).toMatchObject({ name: 'test' });
    expect(r.packageJsonRaw).toContain('"name"');
  });

  it('returns null packageJson for malformed JSON but preserves raw', () => {
    writeFileSync(join(tmp, 'package.json'), 'not { valid json }');
    const r = loadRepo(tmp);
    expect(r.packageJson).toBeNull();
    expect(r.packageJsonRaw).toBe('not { valid json }');
  });

  it('lists src/ subdirectories', () => {
    mkdirSync(join(tmp, 'src', 'audit'), { recursive: true });
    mkdirSync(join(tmp, 'src', 'utils'), { recursive: true });
    const r = loadRepo(tmp);
    expect(r.srcDirs).toContain('audit');
    expect(r.srcDirs).toContain('utils');
  });

  it('returns empty srcDirs when src/ does not exist', () => {
    expect(loadRepo(tmp).srcDirs).toEqual([]);
  });

  it('records progressMdModifiedAt when PROGRESS.md exists', () => {
    writeFileSync(join(tmp, 'PROGRESS.md'), '## state');
    expect(loadRepo(tmp).progressMdModifiedAt).toBeInstanceOf(Date);
  });

  it('sets targetDir on result', () => {
    expect(loadRepo(tmp).targetDir).toBe(tmp);
  });
});

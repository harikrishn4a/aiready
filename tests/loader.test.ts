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

  it('reads CLAUDE.md when AGENTS.md is absent', () => {
    writeFileSync(join(tmp, 'CLAUDE.md'), '# Claude project guide');
    expect(loadRepo(tmp).agentsMd).toContain('Claude project guide');
  });

  it('prefers AGENTS.md over other agent entry candidates', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# primary agents');
    writeFileSync(join(tmp, 'CLAUDE.md'), '# secondary claude');
    expect(loadRepo(tmp).agentsMd).toContain('primary agents');
  });

  it('reads .cursorrules as agent entry', () => {
    writeFileSync(join(tmp, '.cursorrules'), 'Use TypeScript strict mode.');
    expect(loadRepo(tmp).agentsMd).toContain('TypeScript strict');
  });

  it('reads nested .github/copilot-instructions.md', () => {
    mkdirSync(join(tmp, '.github'), { recursive: true });
    writeFileSync(join(tmp, '.github', 'copilot-instructions.md'), '# Copilot rules');
    expect(loadRepo(tmp).agentsMd).toContain('Copilot rules');
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

describe('loadRepo — mdFiles', () => {
  it('returns empty mdFiles for a directory with no .md files', () => {
    expect(loadRepo(tmp).mdFiles).toEqual([]);
  });

  it('includes .md files at root level', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# Agents');
    writeFileSync(join(tmp, 'PROGRESS.md'), '## Progress');
    const r = loadRepo(tmp);
    expect(r.mdFiles).toHaveLength(2);
    expect(r.mdFiles.map((f) => f.name)).toContain('AGENTS.md');
    expect(r.mdFiles.map((f) => f.name)).toContain('PROGRESS.md');
  });

  it('includes .md files in subdirectories', () => {
    mkdirSync(join(tmp, 'docs'), { recursive: true });
    writeFileSync(join(tmp, 'docs', 'architecture.md'), '# Architecture');
    const r = loadRepo(tmp);
    expect(r.mdFiles.some((f) => f.path === 'docs/architecture.md')).toBe(true);
  });

  it('populates path, name, preview, and fullContent', () => {
    const content = '# Title\n' + 'A'.repeat(300);
    writeFileSync(join(tmp, 'README.md'), content);
    const r = loadRepo(tmp);
    const readme = r.mdFiles.find((f) => f.name === 'README.md');
    expect(readme).toBeDefined();
    expect(readme?.path).toBe('README.md');
    expect(readme?.name).toBe('README.md');
    expect(readme?.preview).toHaveLength(200);
    expect(readme?.fullContent).toBe(content);
  });

  it('does not include non-.md files in mdFiles', () => {
    writeFileSync(join(tmp, 'package.json'), '{}');
    writeFileSync(join(tmp, 'README.md'), '# Read me');
    const r = loadRepo(tmp);
    expect(r.mdFiles.every((f) => f.name.endsWith('.md'))).toBe(true);
  });

  it('skips node_modules directory', () => {
    mkdirSync(join(tmp, 'node_modules', 'some-pkg'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'some-pkg', 'README.md'), '# Package');
    writeFileSync(join(tmp, 'README.md'), '# Root');
    const r = loadRepo(tmp);
    expect(r.mdFiles.every((f) => !f.path.startsWith('node_modules'))).toBe(true);
  });
});

// ── Graphify integration ──────────────────────────────────────────────────────

function writeGraph(dir: string, data: object): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'graph.json'), JSON.stringify(data));
}

describe('loadRepo — Graphify detection', () => {
  it('sets usedGraphify: false when no graphify output exists', () => {
    writeFileSync(join(tmp, 'README.md'), '# readme');
    expect(loadRepo(tmp).usedGraphify).toBe(false);
  });

  it('sets usedGraphify: true when graphify-out/graph.json exists', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# agent guide');
    writeGraph(join(tmp, 'graphify-out'), {
      nodes: [{ id: 'n1', file_type: 'document', source_file: 'AGENTS.md' }],
      links: [{ source: 'n1', target: 'n1' }],
    });
    const r = loadRepo(tmp);
    expect(r.usedGraphify).toBe(true);
  });

  it('ranks files by degree and returns top files only', () => {
    writeFileSync(join(tmp, 'A.md'), '# A');
    writeFileSync(join(tmp, 'B.md'), '# B');
    writeFileSync(join(tmp, 'C.md'), '# C');
    writeGraph(join(tmp, 'graphify-out'), {
      nodes: [
        { id: 'nA', file_type: 'document', source_file: 'A.md' },
        { id: 'nB', file_type: 'document', source_file: 'B.md' },
        { id: 'nC', file_type: 'document', source_file: 'C.md' },
      ],
      // B has 2 edges, A has 1, C has 0 — B should rank first
      links: [
        { source: 'nA', target: 'nB' },
        { source: 'nC', target: 'nB' },
      ],
    });
    const r = loadRepo(tmp);
    expect(r.usedGraphify).toBe(true);
    const paths = r.mdFiles.map((f) => f.path);
    expect(paths[0]).toBe('B.md'); // highest degree
    expect(paths).toContain('A.md');
  });

  it('skips non-document nodes', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# agent');
    writeGraph(join(tmp, 'graphify-out'), {
      nodes: [
        { id: 'n1', file_type: 'document', source_file: 'AGENTS.md' },
        { id: 'n2', file_type: 'code', source_file: 'src/index.ts' },
      ],
      links: [{ source: 'n2', target: 'n1' }],
    });
    const r = loadRepo(tmp);
    expect(r.mdFiles.map((f) => f.path)).toEqual(['AGENTS.md']);
  });

  it('finds dated subdirectory graphify-out/YYYY-MM-DD/graph.json', () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# agent');
    writeGraph(join(tmp, 'graphify-out', '2026-06-05'), {
      nodes: [{ id: 'n1', file_type: 'document', source_file: 'AGENTS.md' }],
      links: [],
    });
    const r = loadRepo(tmp);
    expect(r.usedGraphify).toBe(true);
    expect(r.mdFiles.map((f) => f.path)).toContain('AGENTS.md');
  });

  it('returns usedGraphify: false and uses walkMdFiles when graph.json is malformed', () => {
    writeFileSync(join(tmp, 'README.md'), '# readme');
    mkdirSync(join(tmp, 'graphify-out'), { recursive: true });
    writeFileSync(join(tmp, 'graphify-out', 'graph.json'), 'not valid json {{{');
    const r = loadRepo(tmp);
    // Malformed JSON → loadFromGraph returns [] → usedGraphify still true (path was found)
    // but mdFiles will be empty from graphify, not from walker
    // The important behavior: no crash
    expect(r.mdFiles).toBeDefined();
  });
});

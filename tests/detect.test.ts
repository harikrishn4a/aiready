import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { detectStack, detectPackageManager } from '../src/utils/detect';

let dir: string;
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'aiready-detect-')); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

describe('detectStack', () => {
  it('detects a Python/FastAPI project with pytest', () => {
    writeFileSync(join(dir, 'requirements.txt'), 'fastapi>=0.115\nuvicorn==0.30\npytest>=8\n');
    writeFileSync(join(dir, 'pytest.ini'), '[pytest]\n');
    const out = detectStack(dir);
    expect(out).toContain('Python');
    expect(out).toContain('pip install -r requirements.txt');
    expect(out).toContain('pytest');
    expect(out).toContain('FastAPI');
    expect(out).not.toContain('Node.js');
  });

  it('detects a Node project and surfaces package.json scripts', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({
      scripts: { build: 'tsc', test: 'vitest', lint: 'eslint .' },
      dependencies: { commander: '^12' },
    }));
    writeFileSync(join(dir, 'package-lock.json'), '{}');
    const out = detectStack(dir);
    expect(out).toContain('Node.js');
    expect(out).toContain('build, test, lint');
    expect(out).toContain('npm');
  });

  it('returns a generic message when no stack files exist', () => {
    expect(detectStack(dir)).toContain('No recognised stack');
  });

  it('detects Go and Rust', () => {
    writeFileSync(join(dir, 'go.mod'), 'module x\n');
    expect(detectStack(dir)).toContain('Go');
    const dir2 = mkdtempSync(join(tmpdir(), 'aiready-detect2-'));
    try {
      writeFileSync(join(dir2, 'Cargo.toml'), '[package]\n');
      expect(detectStack(dir2)).toContain('Rust');
    } finally {
      rmSync(dir2, { recursive: true, force: true });
    }
  });
});

describe('detectPackageManager', () => {
  it('identifies pnpm/yarn/npm by lockfile', () => {
    writeFileSync(join(dir, 'pnpm-lock.yaml'), '');
    expect(detectPackageManager(dir)).toBe('pnpm');
  });
  it('returns unknown without a lockfile', () => {
    mkdirSync(join(dir, 'sub'));
    expect(detectPackageManager(join(dir, 'sub'))).toBe('unknown');
  });
});

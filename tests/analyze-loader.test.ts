import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { walkSourceFiles, loadSourceFiles, PER_FILE_CONTENT_CAP } from '../src/analyze/loader';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-analyze-loader-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('walkSourceFiles', () => {
  it('returns empty array for an empty directory', () => {
    expect(walkSourceFiles(tmp)).toEqual([]);
  });

  it('finds .ts files at root', () => {
    writeFileSync(join(tmp, 'app.ts'), 'export const x = 1;');
    const files = walkSourceFiles(tmp);
    expect(files.map((f) => f.name)).toContain('app.ts');
  });

  it('finds .py files regardless of directory name', () => {
    mkdirSync(join(tmp, 'mypackage'));
    writeFileSync(join(tmp, 'mypackage', 'service.py'), 'def run(): pass');
    const files = walkSourceFiles(tmp);
    expect(files.map((f) => f.name)).toContain('service.py');
  });

  it('finds files in nested directories without src/ assumption', () => {
    mkdirSync(join(tmp, 'app', 'routers'), { recursive: true });
    writeFileSync(join(tmp, 'app', 'routers', 'users.py'), 'from fastapi import APIRouter');
    const files = walkSourceFiles(tmp);
    expect(files.map((f) => f.path)).toContain('app/routers/users.py');
  });

  it('skips node_modules', () => {
    mkdirSync(join(tmp, 'node_modules', 'lodash'), { recursive: true });
    writeFileSync(join(tmp, 'node_modules', 'lodash', 'index.js'), 'module.exports = {}');
    const files = walkSourceFiles(tmp);
    expect(files.map((f) => f.path)).not.toContain('node_modules/lodash/index.js');
  });

  it('skips dist', () => {
    mkdirSync(join(tmp, 'dist'));
    writeFileSync(join(tmp, 'dist', 'bundle.js'), 'var x = 1;');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('bundle.js');
  });

  it('skips tests directory', () => {
    mkdirSync(join(tmp, 'tests'));
    writeFileSync(join(tmp, 'tests', 'test_app.py'), 'def test_foo(): pass');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('test_app.py');
  });

  it('skips .aiready directory', () => {
    mkdirSync(join(tmp, '.aiready'));
    writeFileSync(join(tmp, '.aiready', 'gaps.md'), '# gaps');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('gaps.md');
  });

  it('skips migrations directory', () => {
    mkdirSync(join(tmp, 'migrations'));
    writeFileSync(join(tmp, 'migrations', '001_init.py'), 'def upgrade(): pass');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('001_init.py');
  });

  it('excludes .md files', () => {
    writeFileSync(join(tmp, 'README.md'), '# readme');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('README.md');
  });

  it('excludes .json files', () => {
    writeFileSync(join(tmp, 'package.json'), '{}');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('package.json');
  });

  it('excludes .yaml files', () => {
    writeFileSync(join(tmp, 'config.yaml'), 'key: value');
    expect(walkSourceFiles(tmp).map((f) => f.name)).not.toContain('config.yaml');
  });

  it('populates name, ext, moduleName correctly', () => {
    writeFileSync(join(tmp, 'pipeline.py'), 'def run(): pass');
    const files = walkSourceFiles(tmp);
    const f = files.find((x) => x.name === 'pipeline.py');
    expect(f).toBeDefined();
    expect(f!.ext).toBe('.py');
    expect(f!.moduleName).toBe('pipeline');
  });

  it('caps fullContent at PER_FILE_CONTENT_CAP', () => {
    const bigContent = 'x'.repeat(PER_FILE_CONTENT_CAP + 1000);
    writeFileSync(join(tmp, 'big.ts'), bigContent);
    const files = walkSourceFiles(tmp);
    const f = files.find((x) => x.name === 'big.ts');
    expect(f!.fullContent.length).toBe(PER_FILE_CONTENT_CAP);
  });
});

describe('loadSourceFiles', () => {
  it('populates all with every source file', () => {
    writeFileSync(join(tmp, 'app.ts'), 'export const x = 1;');
    mkdirSync(join(tmp, 'utils'));
    writeFileSync(join(tmp, 'utils', 'helper.py'), 'def help(): pass');
    const result = loadSourceFiles(tmp, null);
    const names = result.all.map((f) => f.name);
    expect(names).toContain('app.ts');
    expect(names).toContain('helper.py');
  });

  it('relevant only contains stack-matching extensions (TypeScript repo)', () => {
    writeFileSync(join(tmp, 'package.json'), '{"name":"test"}');
    writeFileSync(join(tmp, 'app.ts'), 'export {};');
    writeFileSync(join(tmp, 'helper.py'), 'def x(): pass');
    const result = loadSourceFiles(tmp, null);
    const relExts = result.relevant.map((f) => f.ext);
    expect(relExts).toContain('.ts');
    expect(relExts).not.toContain('.py');
  });

  it('relevant contains .py files for Python repo', () => {
    writeFileSync(join(tmp, 'requirements.txt'), 'fastapi\n');
    writeFileSync(join(tmp, 'main.py'), 'from fastapi import FastAPI');
    const result = loadSourceFiles(tmp, null);
    expect(result.relevant.map((f) => f.ext)).toContain('.py');
  });

  it('sets usedGraphify false when no graph path', () => {
    writeFileSync(join(tmp, 'app.ts'), 'export {};');
    expect(loadSourceFiles(tmp, null).usedGraphify).toBe(false);
  });

  it('sets usedGraphify false when graph path does not exist', () => {
    writeFileSync(join(tmp, 'app.ts'), 'export {};');
    expect(loadSourceFiles(tmp, '/nonexistent/graph.json').usedGraphify).toBe(false);
  });

  it('detectedExtensions matches stack markers', () => {
    writeFileSync(join(tmp, 'requirements.txt'), 'flask\n');
    const result = loadSourceFiles(tmp, null);
    expect(result.detectedExtensions.has('.py')).toBe(true);
  });
});

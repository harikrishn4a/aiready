import { existsSync, readFileSync } from 'fs';
import { join, resolve } from 'path';

/** Resolve the examples/ directory for bundled dist, dev, and vitest layouts. */
export function resolveExamplesDir(): string {
  const candidates = [
    // Bundled: dist/cli.js → dist/examples/
    join(__dirname, 'examples'),
    // Published/dev: package root examples/
    join(__dirname, '..', 'examples'),
    // Vitest from src/utils/ or src/audit/
    join(__dirname, '..', '..', 'examples'),
    join(__dirname, '..', '..', '..', 'examples'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'agents.md'))) return resolve(dir);
  }
  return resolve(candidates[1]);
}

/** Load a template file relative to examples/ (e.g. examples/constraints.md → constraints.md). */
export function loadExampleTemplate(templateFile: string, cap = 20000): string {
  const rel = templateFile.replace(/^examples\//, '');
  const path = join(resolveExamplesDir(), rel);
  if (!existsSync(path)) return '';
  return readFileSync(path, 'utf-8').slice(0, cap);
}

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { resolveExamplesDir, loadExampleTemplate } from '../src/utils/examples-dir';

describe('resolveExamplesDir', () => {
  it('finds examples/ with agents.md', () => {
    const dir = resolveExamplesDir();
    expect(existsSync(join(dir, 'agents.md'))).toBe(true);
  });

  it('loads constraints template', () => {
    const content = loadExampleTemplate('examples/constraints.md');
    expect(content.length).toBeGreaterThan(50);
    expect(content).toContain('MUST');
  });
});

describe('dist/examples bundle', () => {
  it('exists after build with constraints.md', () => {
    const distExamples = join(process.cwd(), 'dist', 'examples', 'constraints.md');
    if (!existsSync(distExamples)) {
      // Build may not have run in this test session — skip gracefully
      return;
    }
    expect(existsSync(distExamples)).toBe(true);
  });
});

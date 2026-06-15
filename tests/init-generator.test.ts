import { describe, it, expect } from 'vitest';
import { loadTemplate, assertTemplateLoaded, BLANK_TEMPLATE_FILES } from '../src/init/generator';

describe('loadTemplate', () => {
  it('loads a canonical example template by examples/ path', () => {
    const content = loadTemplate('examples/agents.md');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('What this is');
  });

  it('loads a canonical example template by bare filename', () => {
    const content = loadTemplate('constraints.md');
    expect(content.length).toBeGreaterThan(0);
    expect(content).toContain('MUST');
  });

  it('returns empty string for a missing template', () => {
    expect(loadTemplate('examples/nonexistent-template-xyz.md')).toBe('');
  });
});

describe('assertTemplateLoaded', () => {
  it('throws for empty template content', () => {
    expect(() => assertTemplateLoaded('examples/x.md', '')).toThrow(/Template not found/);
  });

  it('does not throw for non-empty content', () => {
    expect(() => assertTemplateLoaded('examples/x.md', '# real')).not.toThrow();
  });
});

describe('BLANK_TEMPLATE_FILES', () => {
  it('includes generateOnly template-copy artifacts', () => {
    expect(BLANK_TEMPLATE_FILES.has('Makefile')).toBe(true);
    expect(BLANK_TEMPLATE_FILES.has('TASK.md')).toBe(true);
    expect(BLANK_TEMPLATE_FILES.has('scripts/verify.sh')).toBe(true);
  });

  it('excludes LLM-rewritten artifacts', () => {
    expect(BLANK_TEMPLATE_FILES.has('AGENTS.md')).toBe(false);
    expect(BLANK_TEMPLATE_FILES.has('CONSTRAINTS.md')).toBe(false);
  });
});

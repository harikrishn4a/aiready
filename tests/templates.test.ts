import { describe, it, expect } from 'vitest';
import { loadTemplates, extractSectionHeadings, CANONICAL_FILENAMES } from '../src/audit/templates';

describe('extractSectionHeadings', () => {
  it('returns empty array for content with no ## headings', () => {
    expect(extractSectionHeadings('# Title\n\nSome content here.')).toEqual([]);
  });

  it('returns all ## headings', () => {
    const content = '# Title\n\n## Stack\n\ncontent\n\n## Verification commands\n\ncontent';
    expect(extractSectionHeadings(content)).toEqual(['Stack', 'Verification commands']);
  });

  it('does not include # or ### headings', () => {
    const content = '# Title\n## Section\n### Sub\n## Another';
    const headings = extractSectionHeadings(content);
    expect(headings).toContain('Section');
    expect(headings).toContain('Another');
    expect(headings).not.toContain('Title');
    expect(headings).not.toContain('Sub');
  });

  it('trims whitespace from headings', () => {
    expect(extractSectionHeadings('## Stack  \n## Verification  ')).toEqual(['Stack', 'Verification']);
  });
});

describe('loadTemplates', () => {
  it('loads all expected subsystems', async () => {
    const templates = await loadTemplates('examples');
    expect(Object.keys(templates.primary)).toContain('identity');
    expect(Object.keys(templates.primary)).toContain('verification');
    expect(Object.keys(templates.primary)).toContain('state');
    expect(Object.keys(templates.primary)).toContain('memory');
    expect(Object.keys(templates.primary)).toContain('constraints');
  });

  it('primary identity template contains agents.md content', async () => {
    const templates = await loadTemplates('examples');
    expect(templates.primary['identity']).toContain('AGENTS.md');
  });

  it('primary constraints template is non-empty', async () => {
    const templates = await loadTemplates('examples');
    expect(templates.primary['constraints'].length).toBeGreaterThan(0);
  });

  it('extracts section headings per template file', async () => {
    const templates = await loadTemplates('examples');
    const agentsSections = templates.sections['agents.md'];
    expect(agentsSections).toBeDefined();
    expect(agentsSections).toContain('What this is');
    expect(agentsSections).toContain('Stack');
    expect(agentsSections).toContain('Verification commands');
  });

  it('extracts section headings for constraints.md', async () => {
    const templates = await loadTemplates('examples');
    const sections = templates.sections['constraints.md'];
    expect(sections).toContain('Scope');
    expect(sections).toContain('Verification');
  });

  it('extracts section headings for progress.md', async () => {
    const templates = await loadTemplates('examples');
    const sections = templates.sections['progress.md'];
    expect(sections).toContain('Current State');
    expect(sections).toContain('Completed');
  });

  it('returns empty string for subsystem with no loadable templates', async () => {
    const templates = await loadTemplates('/nonexistent/path');
    expect(templates.primary['identity']).toBe('');
  });
});

describe('CANONICAL_FILENAMES', () => {
  it('has an entry for each of the 5 subsystems', () => {
    expect(CANONICAL_FILENAMES['identity']).toBe('AGENTS.md');
    expect(CANONICAL_FILENAMES['state']).toBe('PROGRESS.md');
    expect(CANONICAL_FILENAMES['constraints']).toBe('CONSTRAINTS.md');
    expect(CANONICAL_FILENAMES['memory']).toBe('ARCHITECTURE.md');
    expect(CANONICAL_FILENAMES['verification']).toBe('Makefile');
  });
});

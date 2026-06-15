import { describe, it, expect, vi } from 'vitest';
import { rewriteToCanonical, sanitisePlaceholders } from '../src/init/rewriter';
import type { LLMProvider } from '../src/utils/llm';

function mockProvider(response: string): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

describe('rewriteToCanonical', () => {
  it('uses exact template headings', async () => {
    const provider = mockProvider(
      '# AGENTS.md\n\n## What this is\nReal project\n\n## Stack\n- Python',
    );
    const result = await rewriteToCanonical(
      { filename: 'AGENTS.md', templateFile: 'agents.md', sourceFiles: [], currentContent: null },
      '/tmp',
      provider,
    );
    expect(result.content).toContain('## What this is');
    expect(result.content).toContain('## Stack');
  });

  it('includes existing content in the prompt', async () => {
    const provider = mockProvider('# AGENTS.md\n\n## What this is\ncontent\n\n## Stack\n- x');
    await rewriteToCanonical(
      { filename: 'AGENTS.md', templateFile: 'agents.md', sourceFiles: [], currentContent: 'Existing rich content here' },
      '/tmp',
      provider,
    );
    const userPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][1] as string;
    expect(userPrompt).toContain('Existing rich content here');
    expect(userPrompt).toContain('=== EXISTING ===');
  });

  it('enforces the 300 line limit', async () => {
    const longContent = Array(400).fill('line').join('\n');
    const provider = mockProvider(longContent);
    const result = await rewriteToCanonical(
      { filename: 'AGENTS.md', templateFile: 'agents.md', sourceFiles: [], currentContent: null },
      '/tmp',
      provider,
    );
    expect(result.content.split('\n').length).toBeLessThanOrEqual(310);
    expect(result.changes.some((c) => c.includes('capped'))).toBe(true);
  });

  it('passes fast: false for quality output', async () => {
    const provider = mockProvider('# AGENTS.md\n\n## What this is\nx\n\n## Stack\n- y');
    await rewriteToCanonical(
      { filename: 'AGENTS.md', templateFile: 'agents.md', sourceFiles: [], currentContent: null },
      '/tmp',
      provider,
    );
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });

  it('dispatches the AGENTS.md per-file prompt', async () => {
    const provider = mockProvider('# AGENTS.md\n\n## What this is\nx\n\n## Stack\n- y');
    await rewriteToCanonical(
      { filename: 'AGENTS.md', templateFile: 'agents.md', sourceFiles: [], currentContent: null },
      '/tmp',
      provider,
    );
    const systemPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(systemPrompt).toContain('FILE: AGENTS.md');
    expect(systemPrompt).toContain('STRUCTURE (maintain this order, never reorder)');
  });

  it('dispatches the CONSTRAINTS.md per-file prompt', async () => {
    const provider = mockProvider('# CONSTRAINTS\n\n## Scope\nrules\n\n## Verification\nrules');
    await rewriteToCanonical(
      { filename: 'CONSTRAINTS.md', templateFile: 'constraints.md', sourceFiles: [], currentContent: null },
      '/tmp',
      provider,
    );
    const systemPrompt = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(systemPrompt).toContain('FILE: CONSTRAINTS.md');
    expect(systemPrompt).toContain('MUST / MUST NOT');
  });

  it('throws when the template does not exist', async () => {
    const provider = mockProvider('# x');
    await expect(
      rewriteToCanonical(
        { filename: 'AGENTS.md', templateFile: 'nonexistent-template-xyz.md', sourceFiles: [], currentContent: null },
        '/tmp',
        provider,
      ),
    ).rejects.toThrow(/Template not found/);
  });
});

describe('sanitisePlaceholders', () => {
  it('removes {{PLACEHOLDER}} text', () => {
    const content = '## Stack\n{{FRAMEWORK}}\n\n## What this is\nReal content';
    const out = sanitisePlaceholders(content);
    expect(out).not.toContain('{{');
    expect(out).toContain('## What this is');
    expect(out).toContain('Real content');
  });

  it('removes placeholder-only headings', () => {
    const content = '## {{DOMAIN_SPECIFIC_SECTION}}\n\n## Real heading\nbody';
    const out = sanitisePlaceholders(content);
    expect(out).not.toContain('{{DOMAIN_SPECIFIC_SECTION}}');
    expect(out).toContain('## Real heading');
  });

  it('collapses extra blank lines', () => {
    const content = 'a\n\n\n\n\nb';
    expect(sanitisePlaceholders(content)).toBe('a\n\nb');
  });
});

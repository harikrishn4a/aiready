import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { generateArtifact } from '../src/init/generator';
import type { LLMProvider } from '../src/utils/llm';
import type { ArtifactPlan } from '../src/init/planner';

function mockProvider(response: string): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

const BASE: ArtifactPlan = {
  filename: 'CONSTRAINTS.md',
  action: 'generate',
  subsystem: 'constraints',
  templateFile: 'examples/constraints.md',
  sourceFiles: ['CLAUDE.md'],
  currentScore: 12,
  reason: 'generate',
  alwaysGenerate: false,
  generateOnly: false,
};

describe('generateArtifact', () => {
  it('throws when template file does not exist', async () => {
    const artifact: ArtifactPlan = {
      ...BASE,
      templateFile: 'examples/nonexistent-template-xyz.md',
    };
    await expect(
      generateArtifact(artifact, '/tmp', mockProvider('# content')),
    ).rejects.toThrow(/Template not found/);
  });

  it('includes template in LLM prompt when template exists', async () => {
    const provider = mockProvider('# CONSTRAINTS\n\nline1\nline2\nline3\nline4');
    await generateArtifact(BASE, PARTIAL_REPO, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toContain('TEMPLATE START');
    expect(call[1]).toContain('MUST');
  });

  it('system prompt enforces exact heading rule — not paraphrase', async () => {
    const provider = mockProvider('## What this is\nReal description\n\n## Stack\n- Python');
    await generateArtifact(BASE, PARTIAL_REPO, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    const systemPrompt: string = call[0];
    expect(systemPrompt).toContain('EXACT section headings');
    expect(systemPrompt).toContain('character for character');
    expect(systemPrompt).toContain('## What this is');
    expect(systemPrompt).toContain('## Current State');
    expect(systemPrompt).toContain('## Stack');
  });

  it('passes fast: false for quality LLM output', async () => {
    const provider = mockProvider('## What this is\nReal description\n\n## Stack\n- Python');
    await generateArtifact(BASE, PARTIAL_REPO, provider);
    const call = (provider.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fast: false });
  });
});

const PARTIAL_REPO = join(__dirname, 'fixtures', 'repos', 'partial-repo');

import { describe, it, expect, vi } from 'vitest';
import { findDriftedHeadings, replaceHeadings, correctHeadings } from '../src/init/corrector';
import type { LLMProvider } from '../src/utils/llm';

function mockProvider(response = ''): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

describe('replaceHeadings', () => {
  it('fixes drifted heading and preserves content below it', () => {
    const content = '## Current Build Status\nSome content here\n\n## Next Best Step\nDo this';
    const fixed = replaceHeadings(
      content,
      ['Current Build Status', 'Next Best Step'],
      ['Current State', 'Next Steps'],
    );
    expect(fixed).toContain('## Current State');
    expect(fixed).toContain('Some content here');
    expect(fixed).toContain('## Next Steps');
    expect(fixed).toContain('Do this');
    expect(fixed).not.toContain('## Current Build Status');
    expect(fixed).not.toContain('## Next Best Step');
  });

  it('leaves unmatched headings unchanged', () => {
    const content = '## What this is\nDescription\n\n## Other Heading\nContent';
    const fixed = replaceHeadings(content, ['Other Heading'], ['Stack']);
    expect(fixed).toContain('## What this is');
    expect(fixed).toContain('## Stack');
    expect(fixed).not.toContain('## Other Heading');
  });

  it('handles empty drifted list (no-op)', () => {
    const content = '## Current State\nContent';
    const fixed = replaceHeadings(content, [], []);
    expect(fixed).toBe(content);
  });

  it('escapes regex special chars in heading names', () => {
    const content = '## C++ Stack\nsome content';
    const fixed = replaceHeadings(content, ['C++ Stack'], ['Stack']);
    expect(fixed).toContain('## Stack');
    expect(fixed).toContain('some content');
    expect(fixed).not.toContain('## C++ Stack');
  });
});

describe('findDriftedHeadings', () => {
  it('detects paraphrased headings via fuzzy similarity', () => {
    const template = '## What this is\n## Stack\n## Session start';
    const content = '## Project Overview\n## Tech Stack\n## Session start';
    const { drifted, canonical } = findDriftedHeadings(content, template);
    expect(drifted).toContain('Tech Stack');
    expect(canonical).toContain('Stack');
  });

  it('does not flag exact matches as drifted', () => {
    const template = '## Session start\n## Completion gate';
    const content = '## Session start\n## Completion gate';
    const { drifted, canonical } = findDriftedHeadings(content, template);
    expect(drifted).toHaveLength(0);
    expect(canonical).toHaveLength(0);
  });

  it('ignores completely different headings (no false positives)', () => {
    const template = '## What this is';
    const content = '## Deployment Guide';
    const { drifted } = findDriftedHeadings(content, template);
    expect(drifted).toHaveLength(0);
  });

  it('returns parallel drifted/canonical arrays of same length', () => {
    const template = '## Current State\n## Stack';
    const content = '## Current Build Status\n## Technology Stack';
    const { drifted, canonical } = findDriftedHeadings(content, template);
    expect(drifted.length).toBe(canonical.length);
  });
});

describe('correctHeadings', () => {
  it('fixes drifted heading without calling LLM when no sections are missing', async () => {
    const content = '## Current Build Status\nReal specific content about migrations\n\n## Stack\nNode.js';
    const template = '## Current State\n{{STATUS}}\n\n## Stack\n{{STACK}}';
    const provider = mockProvider();
    const { content: fixed, corrections } = await correctHeadings(
      content, template, 'PROGRESS.md', provider,
    );
    expect(fixed).toContain('## Current State');
    expect(fixed).toContain('Real specific content about migrations');
    expect(fixed).toContain('## Stack');
    expect(corrections).toHaveLength(1);
    expect(corrections[0]).toContain('Current Build Status');
    expect(corrections[0]).toContain('Current State');
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('does not change content that already matches template headings', async () => {
    const content = '## Current State\nGood content\n\n## Stack\nNode.js';
    const template = '## Current State\n{{STATUS}}\n\n## Stack\n{{STACK}}';
    const provider = mockProvider();
    const { content: fixed, corrections } = await correctHeadings(
      content, template, 'PROGRESS.md', provider,
    );
    expect(fixed).toBe(content);
    expect(corrections).toHaveLength(0);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('calls LLM to add genuinely missing sections', async () => {
    const content = '## Current State\nGood content';
    const template = '## Current State\n{{STATUS}}\n\n## Stack\n{{STACK}}';
    const llmResponse = '## Current State\nGood content\n\n## Stack\nNode.js';
    const provider = mockProvider(llmResponse);
    const { content: fixed, corrections } = await correctHeadings(
      content, template, 'PROGRESS.md', provider,
    );
    expect(provider.chat).toHaveBeenCalledOnce();
    expect(corrections.some((c) => c.includes('added missing'))).toBe(true);
    expect(fixed).toContain('## Stack');
  });

  it('returns zero corrections when content already has all template headings', async () => {
    const content = '## What this is\nDesc\n\n## Stack\nNode.js';
    const template = '## What this is\n{{DESC}}\n\n## Stack\n{{STACK}}';
    const provider = mockProvider();
    const { corrections } = await correctHeadings(content, template, 'AGENTS.md', provider);
    expect(corrections).toHaveLength(0);
  });
});

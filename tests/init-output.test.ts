import { describe, it, expect } from 'vitest';
import { cleanLLMOutput } from '../src/init/output';

describe('cleanLLMOutput', () => {
  it('strips markdown code fences', () => {
    const input = '```markdown\n# Title\n\nLine 1\nLine 2\n```';
    expect(cleanLLMOutput(input)).toBe('# Title\n\nLine 1\nLine 2');
  });

  it('returns trimmed content when no fences', () => {
    expect(cleanLLMOutput('  # Hello\n\nworld  ')).toBe('# Hello\n\nworld');
  });
});

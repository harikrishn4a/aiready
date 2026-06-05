import { describe, it, expect } from 'vitest';
import { estimateTokens } from '../src/utils/tokens';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates 1 token per 4 characters rounded up', () => {
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });

  it('counts multi-line text', () => {
    expect(estimateTokens('a'.repeat(100))).toBe(25);
  });
});

import { describe, it, expect } from 'vitest';
import { shouldUseSpinner } from '../src/utils/spinner';

describe('shouldUseSpinner', () => {
  it('is false when disabled', () => {
    expect(shouldUseSpinner(false)).toBe(false);
  });

  it('is false in CI even when enabled', () => {
    const prev = process.env['CI'];
    process.env['CI'] = 'true';
    expect(shouldUseSpinner(true)).toBe(false);
    if (prev === undefined) {
      delete process.env['CI'];
    } else {
      process.env['CI'] = prev;
    }
  });
});

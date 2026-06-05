import { describe, it, expect } from 'vitest';
import { program } from '../src/cli';

describe('CLI smoke test', () => {
  it('loads without throwing', () => {
    expect(program).toBeDefined();
    expect(program.name()).toBe('aiready');
    expect(program.version()).toBe('0.1.0');
  });

  it('has audit command registered', () => {
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('audit');
  });

  it('does not set a default min-score threshold', () => {
    const audit = program.commands.find((c) => c.name() === 'audit');
    expect(audit?.opts()).not.toHaveProperty('minScore');
  });
});

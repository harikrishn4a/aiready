import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { program } from '../src/cli';

describe('CLI smoke test', () => {
  it('loads without throwing', () => {
    expect(program).toBeDefined();
    expect(program.name()).toBe('aiready');
    expect(program.version()).toBe(JSON.parse(readFileSync('package.json', 'utf8')).version);
  });

  it('has audit command registered', () => {
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('audit');
  });

  it('does not set a default min-score threshold', () => {
    const audit = program.commands.find((c) => c.name() === 'audit');
    expect(audit?.opts()).not.toHaveProperty('minScore');
  });

  it('has analyze command registered', () => {
    const commands = program.commands.map((c) => c.name());
    expect(commands).toContain('analyze');
  });

  it('analyze command has --provider, --model, --target flags', () => {
    const analyze = program.commands.find((c) => c.name() === 'analyze');
    expect(analyze).toBeDefined();
    const opts = analyze!.options.map((o) => o.long);
    expect(opts).toContain('--provider');
    expect(opts).toContain('--model');
    expect(opts).toContain('--target');
  });
});

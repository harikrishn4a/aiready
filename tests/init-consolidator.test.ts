import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { consolidateEntryPoints } from '../src/init/consolidator';
import type { LLMProvider } from '../src/utils/llm';

let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-consolidator-'));
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function mockProvider(response = ''): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

describe('consolidateEntryPoints', () => {
  it('skips consolidation if AGENTS.md does not exist', async () => {
    const provider = mockProvider();
    await consolidateEntryPoints(tmp, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });

  it('writes shim when no unique content found', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# AGENTS.md\n\nFull project context here with stack details.');
    // Long enough not to be detected as already-a-shim (> 100 chars)
    const longContent = '# CLAUDE.md\n\n' + 'This is a very long CLAUDE.md file with lots of text. '.repeat(5);
    writeFileSync(join(tmp, 'CLAUDE.md'), longContent);
    const provider = mockProvider(''); // empty → no unique content
    await consolidateEntryPoints(tmp, provider);
    const shim = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    expect(shim).toContain('See AGENTS.md');
    expect(shim.length).toBeLessThan(100);
  });

  it('merges unique content into AGENTS.md before writing shim', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# AGENTS.md\n\nBasic content.');
    writeFileSync(join(tmp, 'CLAUDE.md'), '# CLAUDE.md\n\n## Extra Section\nUnique detail here.');
    const provider = mockProvider('## Extra Section\nUnique detail here.');
    await consolidateEntryPoints(tmp, provider);
    const agentsMd = readFileSync(join(tmp, 'AGENTS.md'), 'utf-8');
    expect(agentsMd).toContain('## Extra Section');
    const shim = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    expect(shim).toContain('See AGENTS.md');
  });

  it('skips file that is already a shim', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# AGENTS.md\n\nFull content.');
    writeFileSync(join(tmp, 'CLAUDE.md'), 'See AGENTS.md for project context and agent instructions.\n');
    const provider = mockProvider();
    await consolidateEntryPoints(tmp, provider);
    // Already a shim — no LLM call, file unchanged
    expect(provider.chat).not.toHaveBeenCalled();
    const content = readFileSync(join(tmp, 'CLAUDE.md'), 'utf-8');
    expect(content).toContain('See AGENTS.md');
  });

  it('handles .github/copilot-instructions.md with directory creation', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# AGENTS.md\n\nContent.');
    mkdirSync(join(tmp, '.github'));
    writeFileSync(join(tmp, '.github', 'copilot-instructions.md'), '# Copilot\nUnique copilot instructions.');
    const provider = mockProvider('');
    await consolidateEntryPoints(tmp, provider);
    const shim = readFileSync(join(tmp, '.github', 'copilot-instructions.md'), 'utf-8');
    expect(shim).toContain('See AGENTS.md');
  });

  it('skips entry point files that do not exist', async () => {
    writeFileSync(join(tmp, 'AGENTS.md'), '# AGENTS.md\n\nContent.');
    // No CLAUDE.md, no .cursorrules, etc.
    const provider = mockProvider();
    await consolidateEntryPoints(tmp, provider);
    expect(provider.chat).not.toHaveBeenCalled();
  });
});

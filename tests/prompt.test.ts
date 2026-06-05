import { describe, it, expect, vi, afterEach } from 'vitest';
import { selectAuditConfig } from '../src/utils/prompt';

// Mock @inquirer/prompts so tests never block on stdin
vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}));

async function getSelect() {
  const m = await import('@inquirer/prompts');
  return m.select as ReturnType<typeof vi.fn>;
}

afterEach(() => {
  vi.clearAllMocks();
});

// ── Non-interactive (flags provided) ────────────────────────────────────────

describe('selectAuditConfig — flags provided (no prompts)', () => {
  it('returns anthropic config when flags are set and key is in env', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'test-ant-key';
    const config = await selectAuditConfig({ provider: 'anthropic', model: 'fast' });
    expect(config.provider).toBe('anthropic');
    expect(config.modelTier).toBe('fast');
    expect(config.apiKey).toBe('test-ant-key');
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('returns openai config when flags are set and key is in env', async () => {
    process.env['OPENAI_API_KEY'] = 'test-oai-key';
    const config = await selectAuditConfig({ provider: 'openai', model: 'quality' });
    expect(config.provider).toBe('openai');
    expect(config.modelTier).toBe('quality');
    expect(config.apiKey).toBe('test-oai-key');
    delete process.env['OPENAI_API_KEY'];
  });

  it('returns ollama config with no API key required', async () => {
    const config = await selectAuditConfig({ provider: 'ollama', model: 'fast' });
    expect(config.provider).toBe('ollama');
    expect(config.apiKey).toBeUndefined();
  });

  it('does not call select() when both flags are provided', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'key';
    await selectAuditConfig({ provider: 'anthropic', model: 'fast' });
    const select = await getSelect();
    expect(select).not.toHaveBeenCalled();
    delete process.env['ANTHROPIC_API_KEY'];
  });
});

// ── API key gate ──────────────────────────────────────────────────────────────

describe('selectAuditConfig — API key gate', () => {
  it('exits 1 when ANTHROPIC_API_KEY is missing and provider is anthropic', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    delete process.env['ANTHROPIC_API_KEY'];
    await expect(selectAuditConfig({ provider: 'anthropic', model: 'fast' })).rejects.toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('exits 1 when OPENAI_API_KEY is missing and provider is openai', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);
    const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    delete process.env['OPENAI_API_KEY'];
    await expect(selectAuditConfig({ provider: 'openai', model: 'fast' })).rejects.toThrow();
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it('does NOT exit when provider is ollama (no key needed)', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as () => never);

    const config = await selectAuditConfig({ provider: 'ollama', model: 'fast' });
    expect(exitSpy).not.toHaveBeenCalled();
    expect(config.apiKey).toBeUndefined();

    exitSpy.mockRestore();
  });

  it('error message includes env var name and URL', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit');
    }) as () => never);
    const stderrMessages: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation((msg) => {
      stderrMessages.push(String(msg));
      return true;
    });

    delete process.env['ANTHROPIC_API_KEY'];
    await expect(selectAuditConfig({ provider: 'anthropic', model: 'fast' })).rejects.toThrow();

    const combined = stderrMessages.join('');
    expect(combined).toContain('ANTHROPIC_API_KEY');
    expect(combined).toContain('WHY:');
    expect(combined).toContain('FIX:');
    expect(combined).toContain('console.anthropic.com');
    expect(combined).toContain('ollama');

    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });
});

// ── Interactive path ──────────────────────────────────────────────────────────

describe('selectAuditConfig — interactive (no flags)', () => {
  it('calls select() for provider when no flag given', async () => {
    process.env['ANTHROPIC_API_KEY'] = 'key';
    const select = await getSelect();
    select
      .mockResolvedValueOnce('anthropic')  // provider prompt
      .mockResolvedValueOnce('fast');       // model prompt

    await selectAuditConfig({});
    expect(select).toHaveBeenCalledTimes(2);
    delete process.env['ANTHROPIC_API_KEY'];
  });

  it('skips model prompt for ollama (always fast)', async () => {
    const select = await getSelect();
    select.mockResolvedValueOnce('ollama'); // provider only

    const config = await selectAuditConfig({});
    expect(select).toHaveBeenCalledTimes(1);
    expect(config.modelTier).toBe('fast');
  });
});

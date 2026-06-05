import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AnthropicProvider, OpenAIProvider, OllamaProvider, createProvider } from '../src/utils/llm';

// Mock both SDKs — llm.ts is the only file that imports them
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  const MockAnthropic = vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  }));
  (MockAnthropic as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: MockAnthropic };
});

vi.mock('openai', () => {
  const mockCreate = vi.fn();
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  }));
  (MockOpenAI as unknown as { _mockCreate: typeof mockCreate })._mockCreate = mockCreate;
  return { default: MockOpenAI };
});

async function getAnthropicCreate() {
  const sdk = await import('@anthropic-ai/sdk');
  return (sdk.default as unknown as { _mockCreate: ReturnType<typeof vi.fn> })._mockCreate;
}

async function getOpenAICreate() {
  const sdk = await import('openai');
  return (sdk.default as unknown as { _mockCreate: ReturnType<typeof vi.fn> })._mockCreate;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AnthropicProvider ────────────────────────────────────────────────────────

describe('AnthropicProvider', () => {
  it('uses haiku when fast: true', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'response' }] });
    const provider = new AnthropicProvider('test-key');
    await provider.chat('system', 'user', { fast: true });
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('claude-haiku-4-5-20251001');
  });

  it('uses sonnet when fast: false', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'response' }] });
    const provider = new AnthropicProvider('test-key');
    await provider.chat('system', 'user', { fast: false });
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('claude-sonnet-4-6');
  });

  it('uses sonnet by default (no opts)', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'response' }] });
    const provider = new AnthropicProvider('test-key');
    await provider.chat('system', 'user');
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('claude-sonnet-4-6');
  });

  it('returns the text content from the response', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'hello world' }] });
    const provider = new AnthropicProvider('test-key');
    const result = await provider.chat('system', 'user');
    expect(result).toBe('hello world');
  });

  it('sets cache_control on system prompt', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const provider = new AnthropicProvider('test-key');
    await provider.chat('my system', 'user');
    const call = create.mock.calls[0] as [{ system: Array<{ cache_control?: unknown }> }];
    expect(call[0].system[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });
});

// ── OpenAIProvider ───────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  it('uses gpt-4o-mini when fast: true', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'response' } }] });
    const provider = new OpenAIProvider('test-key');
    await provider.chat('system', 'user', { fast: true });
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('gpt-4o-mini');
  });

  it('uses gpt-4o when fast: false', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'response' } }] });
    const provider = new OpenAIProvider('test-key');
    await provider.chat('system', 'user', { fast: false });
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('gpt-4o');
  });

  it('returns the message content from the response', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'openai reply' } }] });
    const provider = new OpenAIProvider('test-key');
    const result = await provider.chat('system', 'user');
    expect(result).toBe('openai reply');
  });
});

// ── OllamaProvider ───────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  it('calls OpenAI-compatible endpoint', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'local reply' } }] });
    const provider = new OllamaProvider();
    const result = await provider.chat('system', 'user');
    expect(create).toHaveBeenCalled();
    expect(result).toBe('local reply');
  });

  it('uses OLLAMA_MODEL env var if set', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    process.env['OLLAMA_MODEL'] = 'mistral';
    const provider = new OllamaProvider();
    await provider.chat('system', 'user');
    const call = create.mock.calls[0] as [{ model: string }];
    expect(call[0].model).toBe('mistral');
    delete process.env['OLLAMA_MODEL'];
  });
});

// ── createProvider ────────────────────────────────────────────────────────────

describe('createProvider', () => {
  it('returns AnthropicProvider for "anthropic"', () => {
    const provider = createProvider('anthropic', 'key');
    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('returns OpenAIProvider for "openai"', () => {
    const provider = createProvider('openai', 'key');
    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('returns OllamaProvider for "ollama" (no key needed)', () => {
    const provider = createProvider('ollama');
    expect(provider).toBeInstanceOf(OllamaProvider);
  });

  it('throws if anthropic key is missing', () => {
    expect(() => createProvider('anthropic')).toThrow('API key required');
  });

  it('throws if openai key is missing', () => {
    expect(() => createProvider('openai')).toThrow('API key required');
  });
});

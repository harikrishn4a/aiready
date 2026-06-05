import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AnthropicProvider,
  OpenAIProvider,
  OllamaProvider,
  createProvider,
  isChatCompatibleOpenAIModel,
  listOpenAIModels,
} from '../src/utils/llm';

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
  const mockList = vi.fn();
  const MockOpenAI = vi.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
    models: { list: mockList },
  }));
  (MockOpenAI as unknown as { _mockCreate: typeof mockCreate; _mockList: typeof mockList })._mockCreate = mockCreate;
  (MockOpenAI as unknown as { _mockCreate: typeof mockCreate; _mockList: typeof mockList })._mockList = mockList;
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

async function getOpenAIList() {
  const sdk = await import('openai');
  return (sdk.default as unknown as { _mockList: ReturnType<typeof vi.fn> })._mockList;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── AnthropicProvider ────────────────────────────────────────────────────────

describe('AnthropicProvider — default routing', () => {
  it('uses haiku when fast: true', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'response' }] });
    await new AnthropicProvider('key').chat('sys', 'user', { fast: true });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-haiku-4-5-20251001');
  });

  it('uses sonnet when fast: false', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    await new AnthropicProvider('key').chat('sys', 'user', { fast: false });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-sonnet-4-6');
  });

  it('uses sonnet by default (no opts)', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    await new AnthropicProvider('key').chat('sys', 'user');
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-sonnet-4-6');
  });

  it('sets cache_control: ephemeral on system prompt', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    await new AnthropicProvider('key').chat('sys', 'user');
    const call = create.mock.calls[0] as [{ system: Array<{ cache_control?: unknown }> }];
    expect(call[0].system[0]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('returns the text content from the response', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: 'hello world' }] });
    expect(await new AnthropicProvider('key').chat('sys', 'user')).toBe('hello world');
  });
});

describe('AnthropicProvider — explicit modelId override', () => {
  it('uses the given modelId regardless of fast hint', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const provider = new AnthropicProvider('key', 'claude-opus-4-8');
    await provider.chat('sys', 'user', { fast: true }); // fast hint should be ignored
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-opus-4-8');
  });

  it('uses the given modelId for quality calls too', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const provider = new AnthropicProvider('key', 'claude-haiku-4-5-20251001');
    await provider.chat('sys', 'user', { fast: false });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-haiku-4-5-20251001');
  });
});

// ── OpenAIProvider ───────────────────────────────────────────────────────────

describe('OpenAIProvider — default routing', () => {
  it('uses gpt-4o-mini when fast: true', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'r' } }] });
    await new OpenAIProvider('key').chat('sys', 'user', { fast: true });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('gpt-4o-mini');
  });

  it('uses gpt-4o when fast: false', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'r' } }] });
    await new OpenAIProvider('key').chat('sys', 'user', { fast: false });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('gpt-4o');
  });

  it('returns message content', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'openai reply' } }] });
    expect(await new OpenAIProvider('key').chat('sys', 'user')).toBe('openai reply');
  });
});

describe('OpenAIProvider — explicit modelId override', () => {
  it('uses the given modelId regardless of fast hint', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    const provider = new OpenAIProvider('key', 'gpt-4-turbo');
    await provider.chat('sys', 'user', { fast: true });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('gpt-4-turbo');
  });
});

// ── OllamaProvider ───────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  it('calls OpenAI-compatible endpoint and returns content', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: 'local reply' } }] });
    expect(await new OllamaProvider().chat('sys', 'user')).toBe('local reply');
  });

  it('uses OLLAMA_MODEL env var if set', async () => {
    const create = await getOpenAICreate();
    create.mockResolvedValue({ choices: [{ message: { content: '' } }] });
    process.env['OLLAMA_MODEL'] = 'mistral';
    await new OllamaProvider().chat('sys', 'user');
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('mistral');
    delete process.env['OLLAMA_MODEL'];
  });
});

// ── listOpenAIModels ──────────────────────────────────────────────────────────

describe('listOpenAIModels', () => {
  it('returns chat models filtered and sorted newest-first', async () => {
    const list = await getOpenAIList();
    list.mockResolvedValue({
      data: [
        { id: 'gpt-4o', created: 1700000002 },
        { id: 'gpt-4o-mini', created: 1700000003 },
        { id: 'text-embedding-ada-002', created: 1700000001 }, // should be filtered out
        { id: 'gpt-3.5-turbo', created: 1700000001 },
      ],
    });
    const models = await listOpenAIModels('test-key');
    const ids = models.map((m) => m.id);
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('gpt-4o-mini');
    expect(ids).not.toContain('text-embedding-ada-002');
    // newest first: gpt-4o-mini (created=3) before gpt-4o (created=2)
    expect(ids.indexOf('gpt-4o-mini')).toBeLessThan(ids.indexOf('gpt-4o'));
  });

  it('excludes fine-tuned models (IDs containing ":")', async () => {
    const list = await getOpenAIList();
    list.mockResolvedValue({
      data: [
        { id: 'gpt-4o', created: 1 },
        { id: 'gpt-4o:ft-acme-2024', created: 2 }, // fine-tuned
      ],
    });
    const models = await listOpenAIModels('test-key');
    expect(models.map((m) => m.id)).not.toContain('gpt-4o:ft-acme-2024');
  });

  it('includes o1 and o3 chat models', async () => {
    const list = await getOpenAIList();
    list.mockResolvedValue({
      data: [
        { id: 'o1', created: 3 },
        { id: 'o3-mini', created: 2 },
        { id: 'gpt-4o', created: 1 },
      ],
    });
    const ids = (await listOpenAIModels('test-key')).map((m) => m.id);
    expect(ids).toContain('o1');
    expect(ids).toContain('o3-mini');
  });

  it('excludes non-chat OpenAI model families', async () => {
    const list = await getOpenAIList();
    list.mockResolvedValue({
      data: [
        { id: 'gpt-4o', created: 10 },
        { id: 'gpt-4o-codex', created: 9 },
        { id: 'gpt-image-1', created: 8 },
        { id: 'gpt-4o-mini-tts', created: 7 },
        { id: 'gpt-4o-transcribe', created: 6 },
        { id: 'whisper-1', created: 5 },
        { id: 'computer-use-preview', created: 4 },
        { id: 'gpt-4o-search-preview', created: 3 },
        { id: 'gpt-4o-realtime-preview', created: 2 },
        { id: 'text-embedding-ada-002', created: 1 },
      ],
    });
    const ids = (await listOpenAIModels('test-key')).map((m) => m.id);
    expect(ids).toEqual(['gpt-4o']);
  });

  it('returns fallback models when API call throws', async () => {
    const list = await getOpenAIList();
    list.mockRejectedValue(new Error('network error'));
    const models = await listOpenAIModels('test-key');
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]?.id).toBe('gpt-4o-mini'); // fallback order
  });

  it('returns fallback when filtered list is empty', async () => {
    const list = await getOpenAIList();
    list.mockResolvedValue({ data: [{ id: 'whisper-1', created: 1 }] });
    const models = await listOpenAIModels('test-key');
    // all filtered out → fallback
    expect(models[0]?.id).toBe('gpt-4o-mini');
  });
});

describe('isChatCompatibleOpenAIModel', () => {
  it('accepts gpt-, o1, and o3 families', () => {
    expect(isChatCompatibleOpenAIModel('gpt-4o-mini')).toBe(true);
    expect(isChatCompatibleOpenAIModel('o1')).toBe(true);
    expect(isChatCompatibleOpenAIModel('o3-mini')).toBe(true);
  });

  it('rejects non-chat interfaces and fine-tunes', () => {
    expect(isChatCompatibleOpenAIModel('whisper-1')).toBe(false);
    expect(isChatCompatibleOpenAIModel('gpt-4o-codex')).toBe(false);
    expect(isChatCompatibleOpenAIModel('gpt-4o:ft-acme')).toBe(false);
    expect(isChatCompatibleOpenAIModel('gpt-4o-realtime-preview')).toBe(false);
  });
});

// ── createProvider ────────────────────────────────────────────────────────────

describe('createProvider', () => {
  it('returns AnthropicProvider for "anthropic"', () => {
    expect(createProvider('anthropic', 'key')).toBeInstanceOf(AnthropicProvider);
  });

  it('returns OpenAIProvider for "openai"', () => {
    expect(createProvider('openai', 'key')).toBeInstanceOf(OpenAIProvider);
  });

  it('returns OllamaProvider for "ollama" (no key needed)', () => {
    expect(createProvider('ollama')).toBeInstanceOf(OllamaProvider);
  });

  it('throws if anthropic key is missing', () => {
    expect(() => createProvider('anthropic')).toThrow('API key required');
  });

  it('throws if openai key is missing', () => {
    expect(() => createProvider('openai')).toThrow('API key required');
  });

  it('passes modelId to AnthropicProvider', async () => {
    const create = await getAnthropicCreate();
    create.mockResolvedValue({ content: [{ type: 'text', text: '' }] });
    const provider = createProvider('anthropic', 'key', 'claude-opus-4-8');
    await provider.chat('sys', 'user', { fast: true });
    expect((create.mock.calls[0] as [{ model: string }])[0].model).toBe('claude-opus-4-8');
  });
});

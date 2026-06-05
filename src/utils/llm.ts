import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

export interface LLMProvider {
  chat(system: string, user: string, opts?: { fast?: boolean }): Promise<string>;
}

export type ProviderName = 'anthropic' | 'openai' | 'ollama';
export type ModelTier = 'fast' | 'quality';

// ── Anthropic ────────────────────────────────────────────────────────────────

const ANTHROPIC_FAST = 'claude-haiku-4-5-20251001';
const ANTHROPIC_QUALITY = 'claude-sonnet-4-6';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async chat(system: string, user: string, opts?: { fast?: boolean }): Promise<string> {
    const model = opts?.fast ? ANTHROPIC_FAST : ANTHROPIC_QUALITY;
    const response = await this.client.messages.create({
      model,
      max_tokens: opts?.fast ? 1024 : 2048,
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    const block = response.content.find((b) => b.type === 'text');
    return block && block.type === 'text' ? block.text : '';
  }
}

// ── OpenAI (and any OpenAI-compatible endpoint) ──────────────────────────────

const OPENAI_FAST = 'gpt-4o-mini';
const OPENAI_QUALITY = 'gpt-4o';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey: string) {
    const baseURL = process.env['OPENAI_BASE_URL'];
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }

  async chat(system: string, user: string, opts?: { fast?: boolean }): Promise<string> {
    const model = opts?.fast ? OPENAI_FAST : OPENAI_QUALITY;
    const response = await this.client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}

// ── Ollama (OpenAI-compatible local endpoint) ─────────────────────────────────

export class OllamaProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor() {
    const host = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
    this.model = process.env['OLLAMA_MODEL'] ?? 'llama3';
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${host}/v1`,
    });
  }

  async chat(system: string, user: string): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    return response.choices[0]?.message?.content ?? '';
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createProvider(name: ProviderName, apiKey?: string): LLMProvider {
  switch (name) {
    case 'anthropic':
      if (!apiKey) throw new Error('API key required for Anthropic provider');
      return new AnthropicProvider(apiKey);
    case 'openai':
      if (!apiKey) throw new Error('API key required for OpenAI provider');
      return new OpenAIProvider(apiKey);
    case 'ollama':
      return new OllamaProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

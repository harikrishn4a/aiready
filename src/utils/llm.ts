import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ModelDef } from './models.js';
import { OPENAI_FALLBACK_MODELS } from './models.js';
import { estimateTokens } from './tokens.js';

export interface ChatOptions {
  fast?: boolean;
  /** Sampling temperature. Pass 0 for the most repeatable output (scoring/mapping). */
  temperature?: number;
  /** Deterministic sampling seed (OpenAI-compatible providers only). */
  seed?: number;
}

export interface LLMProvider {
  chat(system: string, user: string, opts?: ChatOptions): Promise<string>;
  getTotalTokens(): number;
}

function estimateChatTokens(system: string, user: string, response: string): number {
  return estimateTokens(system) + estimateTokens(user) + estimateTokens(response);
}

export type ProviderName = 'anthropic' | 'openai' | 'ollama';
export type ModelTier = 'fast' | 'quality';

// ── Anthropic ────────────────────────────────────────────────────────────────

const ANTHROPIC_FAST = 'claude-haiku-4-5-20251001';
const ANTHROPIC_QUALITY = 'claude-sonnet-4-6';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;
  private modelId: string | undefined;
  private totalTokens = 0;

  constructor(apiKey: string, modelId?: string) {
    this.client = new Anthropic({ apiKey });
    this.modelId = modelId;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  async chat(system: string, user: string, opts?: ChatOptions): Promise<string> {
    // If a specific model was chosen, always use it; otherwise route by fast hint
    const model = this.modelId ?? (opts?.fast ? ANTHROPIC_FAST : ANTHROPIC_QUALITY);
    const maxTokens = opts?.fast ? 1024 : 2048;
    const response = await this.client.messages.create({
      model,
      max_tokens: maxTokens,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: user }],
    });
    const block = response.content.find((b) => b.type === 'text');
    const text = block && block.type === 'text' ? block.text : '';
    this.totalTokens += estimateChatTokens(system, user, text);
    return text;
  }
}

// ── OpenAI (and any OpenAI-compatible endpoint) ──────────────────────────────

const OPENAI_FAST = 'gpt-4o-mini';
const OPENAI_QUALITY = 'gpt-4o';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;
  private modelId: string | undefined;
  private totalTokens = 0;

  constructor(apiKey: string, modelId?: string) {
    const baseURL = process.env['OPENAI_BASE_URL'];
    this.client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    this.modelId = modelId;
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  async chat(system: string, user: string, opts?: ChatOptions): Promise<string> {
    const model = this.modelId ?? (opts?.fast ? OPENAI_FAST : OPENAI_QUALITY);
    const response = await this.client.chat.completions.create({
      model,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.seed !== undefined ? { seed: opts.seed } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const text = response.choices[0]?.message?.content ?? '';
    this.totalTokens += estimateChatTokens(system, user, text);
    return text;
  }
}

// ── Ollama (OpenAI-compatible local endpoint) ─────────────────────────────────

export class OllamaProvider implements LLMProvider {
  private client: OpenAI;
  private model: string;
  private totalTokens = 0;

  constructor() {
    const host = process.env['OLLAMA_HOST'] ?? 'http://localhost:11434';
    this.model = process.env['OLLAMA_MODEL'] ?? 'llama3';
    this.client = new OpenAI({
      apiKey: 'ollama',
      baseURL: `${host}/v1`,
    });
  }

  getTotalTokens(): number {
    return this.totalTokens;
  }

  async chat(system: string, user: string, opts?: ChatOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      ...(opts?.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts?.seed !== undefined ? { seed: opts.seed } : {}),
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const text = response.choices[0]?.message?.content ?? '';
    this.totalTokens += estimateChatTokens(system, user, text);
    return text;
  }
}

// ── Model discovery ───────────────────────────────────────────────────────────

const NON_CHAT_MODEL_SUBSTRINGS = [
  'codex',          // coding agent — different API surface
  'image',          // image generation
  'tts',            // text to speech
  'transcribe',     // audio to text
  'whisper',        // audio transcription
  'computer-use',   // computer use agent
  'search-preview', // search-augmented interface
  'realtime',       // realtime audio API
] as const;

/** True when model ID is a chat-completions-compatible OpenAI model. */
export function isChatCompatibleOpenAIModel(id: string): boolean {
  const isChatFamily =
    id.startsWith('gpt-') ||
    id.startsWith('o1') ||
    id.startsWith('o3');
  if (!isChatFamily || id.includes(':')) {
    return false;
  }
  return !NON_CHAT_MODEL_SUBSTRINGS.some((s) => id.includes(s));
}

export async function listOpenAIModels(apiKey: string): Promise<ModelDef[]> {
  try {
    const baseURL = process.env['OPENAI_BASE_URL'];
    const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
    const response = await client.models.list();
    const chatModels = response.data
      .filter((m) => isChatCompatibleOpenAIModel(m.id))
      .sort((a, b) => b.created - a.created) // newest first
      .map((m) => ({ id: m.id, label: m.id }));
    return chatModels.length > 0 ? chatModels : OPENAI_FALLBACK_MODELS;
  } catch {
    return OPENAI_FALLBACK_MODELS;
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createProvider(name: ProviderName, apiKey?: string, modelId?: string): LLMProvider {
  switch (name) {
    case 'anthropic':
      if (!apiKey) throw new Error('API key required for Anthropic provider');
      return new AnthropicProvider(apiKey, modelId);
    case 'openai':
      if (!apiKey) throw new Error('API key required for OpenAI provider');
      return new OpenAIProvider(apiKey, modelId);
    case 'ollama':
      return new OllamaProvider();
    default: {
      const _exhaustive: never = name;
      throw new Error(`Unknown provider: ${String(_exhaustive)}`);
    }
  }
}

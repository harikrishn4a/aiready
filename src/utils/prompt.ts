import { select } from '@inquirer/prompts';
import type { ProviderName } from './llm.js';
import { listOpenAIModels } from './llm.js';
import { ANTHROPIC_MODELS } from './models.js';

export interface AuditConfig {
  provider: ProviderName;
  modelId: string;
  apiKey: string | undefined;
}

const ENV_KEY_NAMES: Record<ProviderName, string | null> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  ollama: null,
};

const GET_KEY_URLS: Record<string, string> = {
  anthropic: 'https://console.anthropic.com',
  openai: 'https://platform.openai.com/api-keys',
};

function exitMissingKey(provider: ProviderName, envVar: string): never {
  const url = GET_KEY_URLS[provider];
  process.stderr.write(`ERROR: ${envVar} not set\n`);
  process.stderr.write(`WHY:   aiready needs an API key to analyse your repository with ${provider}\n`);
  process.stderr.write(`FIX:   Add it to your .env file:\n`);
  process.stderr.write(`         ${envVar}=your_key_here\n`);
  if (url) {
    process.stderr.write(`       Get your key at: ${url}\n`);
  }
  process.stderr.write(`\n`);
  process.stderr.write(`       If you use Cursor Pro or Claude Code without your own API key,\n`);
  process.stderr.write(`       use Ollama instead (free, runs locally): https://ollama.com\n`);
  process.exit(1);
}

function resolveProvider(flag: string): ProviderName {
  const valid: ProviderName[] = ['anthropic', 'openai', 'ollama'];
  const lower = flag.toLowerCase() as ProviderName;
  if (!valid.includes(lower)) {
    process.stderr.write(`ERROR: Unknown provider "${flag}". Valid options: anthropic, openai, ollama\n`);
    process.exit(1);
  }
  return lower;
}

async function promptProvider(): Promise<ProviderName> {
  return select({
    message: 'Select LLM provider:',
    choices: [
      { name: 'Anthropic', value: 'anthropic' as ProviderName },
      { name: 'OpenAI', value: 'openai' as ProviderName },
      { name: 'Ollama (local — no API key needed)', value: 'ollama' as ProviderName },
    ],
  });
}

async function promptModelId(provider: ProviderName, apiKey: string | undefined): Promise<string> {
  if (provider === 'ollama') {
    return process.env['OLLAMA_MODEL'] ?? 'llama3';
  }

  if (provider === 'anthropic') {
    return select({
      message: 'Select model:',
      choices: ANTHROPIC_MODELS.map((m) => ({ name: m.label, value: m.id })),
    });
  }

  // openai — fetch available models dynamically, fall back to static list
  const models = await listOpenAIModels(apiKey!);
  return select({
    message: 'Select model:',
    choices: models.map((m) => ({ name: m.label, value: m.id })),
  });
}

export async function selectAuditConfig(flags: {
  provider?: string;
  model?: string;
}): Promise<AuditConfig> {
  // 1. Provider — from flag or interactive prompt
  const provider = flags.provider ? resolveProvider(flags.provider) : await promptProvider();

  // 2. API key gate — checked before model selection so OpenAI can use the key to fetch models
  const envVarName = ENV_KEY_NAMES[provider];
  let apiKey: string | undefined;
  if (envVarName) {
    apiKey = process.env[envVarName];
    if (!apiKey) exitMissingKey(provider, envVarName);
  }

  // 3. Model ID — from flag or interactive prompt (OpenAI fetches list dynamically)
  const modelId = flags.model ?? (await promptModelId(provider, apiKey));

  return { provider, modelId, apiKey };
}

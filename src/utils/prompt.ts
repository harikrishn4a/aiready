import { select } from '@inquirer/prompts';
import type { ProviderName, ModelTier } from './llm.js';

export interface AuditConfig {
  provider: ProviderName;
  modelTier: ModelTier;
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

function resolveProvider(flag?: string): ProviderName {
  if (!flag) return 'anthropic';
  const valid: ProviderName[] = ['anthropic', 'openai', 'ollama'];
  const lower = flag.toLowerCase() as ProviderName;
  if (!valid.includes(lower)) {
    process.stderr.write(`ERROR: Unknown provider "${flag}". Valid options: anthropic, openai, ollama\n`);
    process.exit(1);
  }
  return lower;
}

function resolveModelTier(flag?: string): ModelTier | undefined {
  if (!flag) return undefined;
  const lower = flag.toLowerCase();
  if (lower === 'fast' || lower === 'quality') return lower;
  process.stderr.write(`ERROR: Unknown model tier "${flag}". Valid options: fast, quality\n`);
  process.exit(1);
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

async function promptModelTier(provider: ProviderName): Promise<ModelTier> {
  if (provider === 'ollama') return 'fast';

  const choices: Array<{ name: string; value: ModelTier }> =
    provider === 'anthropic'
      ? [
          { name: 'Claude Haiku  — fast, cheap, good for most repos', value: 'fast' },
          { name: 'Claude Sonnet — slower, better, for large or complex repos', value: 'quality' },
        ]
      : [
          { name: 'GPT-4o Mini  — fast, cheap, good for most repos', value: 'fast' },
          { name: 'GPT-4o       — slower, better, for large or complex repos', value: 'quality' },
        ];

  return select({ message: 'Select model:', choices });
}

export async function selectAuditConfig(flags: {
  provider?: string;
  model?: string;
}): Promise<AuditConfig> {
  const providerFromFlag = flags.provider ? resolveProvider(flags.provider) : undefined;
  const tierFromFlag = flags.model ? resolveModelTier(flags.model) : undefined;

  const provider = providerFromFlag ?? (await promptProvider());
  const modelTier = tierFromFlag ?? (await promptModelTier(provider));

  const envVarName = ENV_KEY_NAMES[provider];
  if (envVarName) {
    const apiKey = process.env[envVarName];
    if (!apiKey) exitMissingKey(provider, envVarName);
    return { provider, modelTier, apiKey };
  }

  return { provider, modelTier, apiKey: undefined };
}

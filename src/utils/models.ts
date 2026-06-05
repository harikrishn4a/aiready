export interface ModelDef {
  id: string;
  label: string;
}

// Versioned list — update when Anthropic releases new models.
// IDs are the exact strings passed to the API.
export const ANTHROPIC_MODELS: ModelDef[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5  — fast, cheapest' },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6 — balanced (recommended)' },
  { id: 'claude-sonnet-4-20250514',  label: 'Claude Sonnet 4   — balanced' },
  { id: 'claude-opus-4-8',           label: 'Claude Opus 4.8   — most capable' },
  { id: 'claude-opus-4-20250514',    label: 'Claude Opus 4     — most capable' },
];

// Fallback used when the OpenAI /v1/models fetch fails.
export const OPENAI_FALLBACK_MODELS: ModelDef[] = [
  { id: 'gpt-4o-mini',     label: 'GPT-4o Mini' },
  { id: 'gpt-4o',          label: 'GPT-4o' },
  { id: 'gpt-4-turbo',     label: 'GPT-4 Turbo' },
  { id: 'gpt-3.5-turbo',   label: 'GPT-3.5 Turbo' },
];

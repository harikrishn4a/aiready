import { resolve } from 'path';
import { loadRepo } from './loader.js';
import { mapFiles } from './mapper.js';
import { scoreRepo } from './scorer.js';
import { report } from './reporter.js';
import { selectAuditConfig } from '../utils/prompt.js';
import { createProvider } from '../utils/llm.js';

export interface AuditOptions {
  json: boolean;
  minScore: number;
  provider?: string;
  model?: string;
}

export async function runAudit(target: string, opts: AuditOptions): Promise<void> {
  const config = await selectAuditConfig({ provider: opts.provider, model: opts.model });
  const provider = createProvider(config.provider, config.apiKey, config.modelId);

  const targetDir = resolve(target);
  const files = loadRepo(targetDir);
  const mappings = await mapFiles(files.mdFiles, provider, files.usedGraphify);
  const scored = await scoreRepo(files, mappings, provider);
  const totalTokens = provider.getTotalTokens();
  report(scored, { json: opts.json, tokenUsage: totalTokens });

  if (!opts.json) {
    const display =
      totalTokens >= 1000 ? `~${Math.ceil(totalTokens / 1000)}k` : `~${totalTokens}`;
    console.log(`\nTokens used: ${display}`);
  }

  if (scored.overall < opts.minScore) {
    process.exit(1);
  }
}

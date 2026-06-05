import { resolve } from 'path';
import { loadRepo } from '../audit/loader.js';
import { mapFiles } from '../audit/mapper.js';
import { scoreRepo } from '../audit/scorer.js';
import type { LLMProvider } from '../utils/llm.js';

export async function getAuditScore(
  target: string,
  provider: LLMProvider,
): Promise<number> {
  const targetDir = resolve(target);
  const files = loadRepo(targetDir);
  const mappings = await mapFiles(files.mdFiles, provider, files.usedGraphify);
  const scored = await scoreRepo(files, mappings, provider);
  return scored.overall;
}

import { resolve } from 'path';
import { loadRepo } from '../audit/loader.js';
import { mapFiles } from '../audit/mapper.js';
import { scoreRepo } from '../audit/scorer.js';
import type { LLMProvider } from '../utils/llm.js';

export interface AuditScoreResult {
  overall: number;
  subsystems: Record<string, number>;
  gaps: Record<string, string[]>;
  gapTriage: Array<{ subsystem: string; gap: string; category: 'human' | 'code' | 'docs' }>;
  ignoredDuplicates: string[];
}

export async function getAuditScoreDetailed(
  target: string,
  provider: LLMProvider,
): Promise<AuditScoreResult> {
  const targetDir = resolve(target);
  const files = loadRepo(targetDir);
  const mappings = await mapFiles(files.mdFiles, provider, { forceKeep: files.seedFiles });
  const scored = await scoreRepo(files, mappings, provider);
  const subs = ['identity', 'verification', 'state', 'memory', 'constraints'] as const;
  const gapTriage = subs.flatMap((s) =>
    (scored[s].gapTriage ?? []).map((t) => ({ subsystem: s, gap: t.gap, category: t.category })),
  );
  return {
    overall: scored.overall,
    subsystems: Object.fromEntries(subs.map((s) => [s, scored[s].score])),
    gaps: Object.fromEntries(subs.map((s) => [s, scored[s].gaps])),
    gapTriage,
    ignoredDuplicates: files.ignoredDuplicates,
  };
}

export async function getAuditScore(target: string, provider: LLMProvider): Promise<number> {
  return (await getAuditScoreDetailed(target, provider)).overall;
}

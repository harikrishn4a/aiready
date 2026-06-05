import { resolve } from 'path';
import { loadRepo } from './loader.js';
import { mapFiles } from './mapper.js';
import { scoreRepo } from './scorer.js';
import { report } from './reporter.js';

export interface AuditOptions {
  json: boolean;
  minScore: number;
}

export async function runAudit(target: string, opts: AuditOptions): Promise<void> {
  const apiKey = process.env['ANTHROPIC_API_KEY'];
  if (!apiKey) {
    process.stderr.write('ERROR: ANTHROPIC_API_KEY is not set\n');
    process.stderr.write('WHY:   aiready audit uses LLM-powered scoring and requires an API key\n');
    process.stderr.write('FIX:   export ANTHROPIC_API_KEY=sk-ant-... and re-run\n');
    process.exit(1);
  }

  const targetDir = resolve(target);
  const files = loadRepo(targetDir);
  const mappings = await mapFiles(files.mdFiles, apiKey);
  const scored = await scoreRepo(files, mappings, apiKey);
  report(scored, { json: opts.json });

  if (scored.overall < opts.minScore) {
    process.exit(1);
  }
}

import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { runAudit } from '../audit/index.js';
import { selectAuditConfig } from '../utils/prompt.js';
import { createProvider } from '../utils/llm.js';
import { parsePlan } from './parser.js';
import { executeGenerate, executeImprove } from './executor.js';
import { getAuditScore } from './scorer.js';
import type { InitFlags } from './executor.js';

export type { InitFlags };

function printScoreDelta(before: number, after: number): void {
  const delta = after - before;
  const sign = delta >= 0 ? '+' : '';
  const sep = '─'.repeat(52);
  console.log(`\n${sep}`);
  console.log(`AI Readiness: ${before}/100 → ${after}/100  (${sign}${delta})`);
  if (delta > 0) {
    console.log('\nRun `npx aiready audit` for the full updated report.');
  } else if (delta === 0) {
    console.log('\nScore unchanged. Review generated files and re-run audit.');
  } else {
    console.log('\nScore decreased. Generated files may need manual review.');
  }
  console.log(sep);
}

export async function runInit(target: string, flags: InitFlags): Promise<void> {
  const targetDir = resolve(target);
  const planPath = join(targetDir, '.aiready', 'plan.md');

  if (!existsSync(planPath)) {
    console.log('No .aiready/plan.md found. Running audit first...\n');
    await runAudit(target, { json: false, provider: flags.provider, model: flags.model });
    if (!existsSync(planPath)) {
      console.error('Could not generate .aiready/plan.md. Run `npx aiready audit` first.');
      process.exit(1);
    }
  }

  const plan = await parsePlan(planPath);
  if (!plan) {
    console.error('Could not parse .aiready/plan.md. Run `npx aiready audit` first.');
    process.exit(1);
    return;
  }

  const total = plan.generate.length + plan.improve.length;

  if (total === 0) {
    console.log('Nothing to do — repository harness appears complete.');
    console.log('Run `npx aiready drift` to check for stale content.');
    return;
  }

  if (flags.dryRun) {
    console.log('\nDRY RUN — no files will be written\n');
    for (let i = 0; i < plan.generate.length; i++) {
      const item = plan.generate[i];
      console.log(`[${i + 1}/${total}] Would generate: ${item.filename}`);
      if (item.sourceFiles.length > 0) {
        console.log(`      Source: ${item.sourceFiles.join(', ')}`);
      }
      console.log(`      Template: ${item.templateFile}`);
      console.log('');
    }
    for (let i = 0; i < plan.improve.length; i++) {
      const item = plan.improve[i];
      const step = plan.generate.length + i + 1;
      console.log(`[${step}/${total}] Would improve: ${item.filename} → ${item.section}`);
      console.log(`      Fix: ${item.fix}`);
      console.log('');
    }
    console.log('Run without --dry-run to execute.');
    return;
  }

  console.log(`\nFound ${plan.generate.length} artifacts to generate, ${plan.improve.length} to improve.\n`);

  const config = await selectAuditConfig({ provider: flags.provider, model: flags.model });
  const provider = createProvider(config.provider, config.apiKey, config.modelId);
  const scoreBefore = plan.overall;

  for (let i = 0; i < plan.generate.length; i++) {
    await executeGenerate(plan.generate[i], targetDir, flags, i + 1, total, provider);
  }

  for (let i = 0; i < plan.improve.length; i++) {
    const step = plan.generate.length + i + 1;
    await executeImprove(plan.improve[i], targetDir, flags, step, total, provider);
  }

  console.log('\nRe-scoring repository...');
  const scoreAfter = await getAuditScore(targetDir, provider);
  printScoreDelta(scoreBefore, scoreAfter);

  const totalTokens = provider.getTotalTokens();
  const display = totalTokens >= 1000 ? `~${Math.ceil(totalTokens / 1000)}k` : `~${totalTokens}`;
  console.log(`\nTokens used: ${display}`);
}

import { resolve } from 'path';
import { existsSync } from 'fs';
import { confirm } from '@inquirer/prompts';
import { runAudit } from '../audit/index.js';
import { selectAuditConfig } from '../utils/prompt.js';
import { createProvider } from '../utils/llm.js';
import { buildInitPlan } from './planner.js';
import { executeArtifact, type InitFlags } from './executor.js';
import { getAuditScoreDetailed, type AuditScoreResult } from './scorer.js';
import { consolidateEntryPoints } from './consolidator.js';
import type { ArtifactPlan, InitPlan } from './planner.js';
import { CANONICAL_ARTIFACTS } from '../audit/remediation.js';
import { planFilePath, PLAN_DIR } from '../utils/layout.js';
import { SCORING_DISCLOSURE } from '../audit/reporter.js';

export type { InitFlags };

function isForced(flags: InitFlags, filename: string): boolean {
  if (flags.force === true) return true;
  if (typeof flags.force === 'string') return flags.force === filename;
  return false;
}

function printPlanPreview(artifacts: ArtifactPlan[]): void {
  const generate = artifacts.filter((a) => a.action === 'generate');
  const improve  = artifacts.filter((a) => a.action === 'improve');
  const skip     = artifacts.filter((a) => a.action === 'skip');

  const padFile = (s: string) => s.padEnd(22);
  const padSub  = (s: string | null) => (s ?? '—').padEnd(14);

  const dest = (a: ArtifactPlan) => (a.outputPath && a.outputPath !== a.filename ? `→ ${a.outputPath}` : '');

  if (generate.length > 0) {
    console.log(`\n  GENERATE (${generate.length}):`);
    for (const a of generate) {
      const sources = a.sourceFiles.length > 0 ? `sources: ${a.sourceFiles.slice(0, 3).join(', ')}` : '';
      console.log(`    ${padFile(a.filename)} ${padSub(a.subsystem)} ${dest(a).padEnd(22)} ${sources}`);
    }
  }

  if (improve.length > 0) {
    console.log(`\n  IMPROVE (${improve.length}):`);
    for (const a of improve) {
      console.log(`    ${padFile(a.filename)} ${padSub(a.subsystem)} ${dest(a).padEnd(22)} ${a.reason}`);
    }
  }

  if (skip.length > 0) {
    console.log(`\n  SKIP (${skip.length}):`);
    for (const a of skip) {
      console.log(`    ${padFile(a.filename)} ${a.reason}`);
    }
  }
}

function printScoreDelta(
  before: number,
  after: number,
  beforeSubs: Record<string, number>,
  afterSubs: Record<string, number>,
  artifacts: ArtifactPlan[],
): void {
  const delta = after - before;
  const sign = delta >= 0 ? '+' : '';
  const sep = '─'.repeat(52);
  console.log(`\n${sep}`);
  console.log(`AI Readiness: ${before}/100 → ${after}/100  (${sign}${delta})`);
  console.log('');

  const subsystems = ['identity', 'verification', 'state', 'memory', 'constraints'];
  for (const sub of subsystems) {
    const b = beforeSubs[sub] ?? 0;
    const a = afterSubs[sub] ?? 0;
    const d = a - b;
    const sign2 = d > 0 ? '+' : d < 0 ? '' : ' ';
    // Find artifacts that affect this subsystem
    const changed = artifacts
      .filter((art) => art.subsystem === sub && art.action !== 'skip')
      .map((art) => art.filename)
      .join(', ');
    const note = changed ? `  ${changed}` : d === 0 ? '  unchanged' : '';
    console.log(`  ${sub.padEnd(14)} ${String(b).padStart(3)} → ${String(a).padEnd(3)}  ${sign2}${Math.abs(d)}${note}`);
  }

  if (delta > 0) {
    console.log('\nRun `npx aiready audit` for the full updated report.');
  } else if (delta === 0) {
    console.log('\nScore unchanged. Review generated files and re-run audit.');
  } else {
    console.log('\nScore decreased. Generated files may need manual review.');
  }
  console.log(sep);
}

// Agent entry files are consolidated into shims, not removed — never suggest them.
const AGENT_ENTRY_FILES = new Set([
  'CLAUDE.md', 'AGENT.md', '.windsurfrules', '.cursorrules',
  '.github/copilot-instructions.md',
]);

function suggestNoiseCleaning(plan: InitPlan): void {
  const canonicalFilenames = new Set(CANONICAL_ARTIFACTS.map((a) => a.filename));
  const sourcesUsed = new Set(plan.artifacts.flatMap((a) => a.sourceFiles));

  const noiseCandidates = [...sourcesUsed].filter((f) => {
    if (canonicalFilenames.has(f)) return false;   // keep canonical files
    if (AGENT_ENTRY_FILES.has(f)) return false;     // shimmed, not noise
    if (f === 'README.md') return false;            // never suggest removing README
    if (f.startsWith('.aiready/')) return false;    // keep legacy aiready files
    if (f.startsWith(`${PLAN_DIR}/`)) return false; // keep the plan folder
    if (f === 'package.json') return false;         // build manifest, not noise
    if (f.startsWith('scripts/')) return false;     // keep scripts
    if (f.startsWith('change_logs/')) return true;  // changelog files are candidates
    return true;                                    // other non-canonical sources
  });

  if (noiseCandidates.length === 0) return;

  const sep = '─'.repeat(52);
  console.log(`\n${sep}`);
  console.log('SOURCE FILES — review for cleanup');
  console.log(sep);
  console.log('Content from these files has been extracted into canonical artifacts.');
  console.log('After manual review, consider removing them to reduce noise:\n');
  for (const file of noiseCandidates) {
    console.log(`  ${file}`);
  }
  console.log('\nDo not delete without reviewing — content may not be fully captured.');
  console.log(sep);
}

const TRIAGE_LABELS: Array<{ category: 'human' | 'code' | 'docs'; heading: string }> = [
  { category: 'human', heading: 'NEEDS HUMAN INPUT (decide / provide ground truth):' },
  { category: 'code', heading: 'RESOLVE IN STAGE 3 — analyze (reads source code):' },
  { category: 'docs', heading: 'STAGE 2 CAN ADDRESS (documentation):' },
];

function printRemainingGaps(
  afterSubs: Record<string, number>,
  triage: AuditScoreResult['gapTriage'],
): void {
  const subsystems = ['identity', 'verification', 'state', 'memory', 'constraints'];
  const below100 = subsystems.filter((s) => (afterSubs[s] ?? 0) < 100);
  if (below100.length === 0) return;

  const sep = '─'.repeat(52);
  console.log(`\n${sep}`);
  console.log("REMAINING GAPS — why the score isn't 100");
  console.log(sep);
  for (const sub of subsystems) {
    console.log(`  ${sub.padEnd(13)} ${String(afterSubs[sub] ?? 0).padStart(3)}`);
  }

  if (triage.length > 0) {
    console.log('');
    for (const { category, heading } of TRIAGE_LABELS) {
      const items = triage.filter((g) => g.category === category);
      if (items.length === 0) continue;
      console.log(`  ${heading}`);
      for (const item of items) {
        console.log(`    • [${item.subsystem}] ${item.gap}`);
      }
    }
    console.log('\n  → human items are yours to fill; code items are for `npx aiready analyze` (Stage 3).');
  }

  console.log(`\n${SCORING_DISCLOSURE}`);
  console.log(sep);
}

export async function runInit(target: string, flags: InitFlags): Promise<void> {
  const targetDir = resolve(target);
  const planPath = planFilePath(targetDir);

  if (!existsSync(planPath)) {
    console.log('No plan/plan.md found. Running audit first...\n');
    await runAudit(target, { json: false, provider: flags.provider, model: flags.model });
    if (!existsSync(planPath)) {
      console.error('Could not generate plan/plan.md. Run `npx aiready audit` first.');
      process.exit(1);
    }
  }

  let plan;
  try {
    plan = await buildInitPlan(planPath, targetDir);
  } catch (err) {
    console.error(`Could not parse plan/plan.md: ${(err as Error).message}`);
    console.error('Run `npx aiready audit` first.');
    process.exit(1);
    return;
  }

  const actionableArtifacts = plan.artifacts.filter((a) => a.action !== 'skip' || isForced(flags, a.filename));
  const activeArtifacts = actionableArtifacts.filter((a) => {
    if (a.action === 'skip' && isForced(flags, a.filename)) return true;
    return a.action !== 'skip';
  });

  if (flags.dryRun) {
    console.log('\nAIReady — Init (DRY RUN)\n');
    console.log(`Reading ${planPath}...\n`);
    console.log(`Planned actions (${plan.artifacts.length} artifacts):`);
    printPlanPreview(plan.artifacts);
    console.log('\nRun without --dry-run to execute.');
    return;
  }

  const total = plan.artifacts.length;
  const actionCount = activeArtifacts.length;

  if (actionCount === 0) {
    console.log('Nothing to do — repository harness appears complete.');
    console.log('Run `npx aiready drift` to check for stale content.');
    return;
  }

  console.log('\nAIReady — Init\n');
  console.log(`Reading ${planPath}...\n`);
  console.log(`Planned actions (${total} artifacts):`);
  printPlanPreview(plan.artifacts);
  console.log('');

  // Confirmation (skip if --yes)
  if (!flags.yes) {
    const proceed = await confirm({ message: `Proceed with ${actionCount} action${actionCount === 1 ? '' : 's'}?`, default: true });
    if (!proceed) {
      console.log('Aborted.');
      return;
    }
  }

  const config = await selectAuditConfig({ provider: flags.provider, model: flags.model });
  const provider = createProvider(config.provider, config.apiKey, config.modelId);

  // Capture before scores from plan
  const beforeSubs: Record<string, number> = {};
  for (const a of plan.artifacts) {
    if (a.subsystem && a.currentScore !== null) {
      beforeSubs[a.subsystem] = Math.max(beforeSubs[a.subsystem] ?? 0, a.currentScore);
    }
  }

  const initContext = {
    subsystemSources: plan.subsystemSources,
    sourceContext: plan.sourceContext,
  };

  let step = 0;
  for (const artifact of plan.artifacts) {
    const forced = isForced(flags, artifact.filename);
    if (artifact.action === 'skip' && !forced) continue;

    step++;
    // A forced skip is materialised as a generate.
    const effective: ArtifactPlan = forced && artifact.action === 'skip'
      ? { ...artifact, action: 'generate' }
      : artifact;

    await executeArtifact(effective, targetDir, flags, step, actionCount, provider, initContext);
  }

  // Consolidate entry points (CLAUDE.md etc. → AGENTS.md shims)
  await consolidateEntryPoints(targetDir, provider);

  console.log('\nRe-scoring repository...');
  const scoreAfterResult = await getAuditScoreDetailed(targetDir, provider);
  const scoreBefore = plan.overall;
  const scoreAfter = scoreAfterResult.overall;

  printScoreDelta(scoreBefore, scoreAfter, beforeSubs, scoreAfterResult.subsystems, plan.artifacts);

  printRemainingGaps(scoreAfterResult.subsystems, scoreAfterResult.gapTriage);

  suggestNoiseCleaning(plan);

  const totalTokens = provider.getTotalTokens();
  const display = totalTokens >= 1000 ? `~${Math.ceil(totalTokens / 1000)}k` : `~${totalTokens}`;
  console.log(`\nTokens used: ${display}`);
}

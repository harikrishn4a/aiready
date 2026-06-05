import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { ArtifactPlan } from './planner.js';
import { generateArtifact, type InitContext } from './generator.js';
import { improveArtifact } from './improver.js';
import { cleanLLMOutput } from './output.js';

export interface InitFlags {
  provider?: string;
  model?: string;
  force?: boolean | string;
  dryRun?: boolean;
  yes?: boolean;
}

function isForced(flags: InitFlags, filename: string): boolean {
  if (flags.force === true) return true;
  if (typeof flags.force === 'string') return flags.force === filename;
  return false;
}

export async function executeGenerate(
  artifact: ArtifactPlan,
  target: string,
  flags: InitFlags,
  step: number,
  total: number,
  provider: LLMProvider,
  initContext?: InitContext,
): Promise<void> {
  const filePath = join(target, artifact.filename);
  const label = `[${step}/${total}]`;

  console.log(`${label} Generating ${artifact.filename}`);
  if (artifact.subsystem) console.log(`      Subsystem: ${artifact.subsystem}`);
  if (artifact.sourceFiles.length > 0) {
    console.log(`      Sources: ${artifact.sourceFiles.join(', ')}`);
  }
  console.log(`      Template: ${artifact.templateFile}`);

  const fileExists = existsSync(filePath);
  const forceThis = isForced(flags, artifact.filename);
  if (fileExists && !forceThis && !artifact.alwaysGenerate) {
    console.log(`      ⊜ Skipped — already exists (use --force ${artifact.filename} to overwrite)\n`);
    return;
  }

  const content = cleanLLMOutput(await generateArtifact(artifact, target, provider, initContext));
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  const lines = content.split('\n').length;
  console.log(`      ✓ Written — ${lines} lines\n`);
}

export async function executeImprove(
  artifact: ArtifactPlan,
  target: string,
  flags: InitFlags,
  step: number,
  total: number,
  provider: LLMProvider,
  initContext?: InitContext,
): Promise<void> {
  const filePath = join(target, artifact.filename);
  const label = `[${step}/${total}]`;

  console.log(`${label} Improving ${artifact.filename}`);
  console.log(`      Reason: ${artifact.reason}`);

  if (!existsSync(filePath)) {
    console.log(`      ⊜ Skipped — file does not exist\n`);
    return;
  }

  const currentContent = readFileSync(filePath, 'utf-8');
  let updatedContent: string;
  if (currentContent.trim().length === 0) {
    console.log(`      Empty file — using generate path`);
    updatedContent = cleanLLMOutput(await generateArtifact(artifact, target, provider, initContext));
  } else {
    updatedContent = cleanLLMOutput(await improveArtifact(artifact, target, provider, initContext));
  }
  writeFileSync(filePath, updatedContent, 'utf-8');
  console.log(`      ✓ Patched\n`);
}

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

const MIN_WRITE_LINES = 3;

function isForced(flags: InitFlags, filename: string): boolean {
  if (flags.force === true) return true;
  if (typeof flags.force === 'string') return flags.force === filename;
  return false;
}

function assertWritableContent(filename: string, content: string): void {
  const trimmed = content.trim();
  const lines = content.split('\n').length;
  if (trimmed.length === 0 || lines < MIN_WRITE_LINES) {
    throw new Error(
      `ERROR: Generated content for ${filename} is empty or too short (${lines} lines)\n` +
      `WHY: The LLM returned insufficient content to write a useful harness artifact\n` +
      `FIX: Re-run with --force ${filename} after verifying templates load from dist/examples/ and source context is available`,
    );
  }
}

function writeArtifact(filePath: string, content: string, filename: string): number {
  assertWritableContent(filename, content);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  return content.split('\n').length;
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
  const lines = writeArtifact(filePath, content, artifact.filename);
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
  const lines = writeArtifact(filePath, updatedContent, artifact.filename);
  console.log(`      ✓ Written — ${lines} lines\n`);
}

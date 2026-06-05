import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { GenerateItem, ImproveItem } from './parser.js';
import { generateArtifact } from './generator.js';
import { improveArtifact } from './improver.js';

export interface InitFlags {
  provider?: string;
  model?: string;
  force?: boolean | string;
  dryRun?: boolean;
}

function isForced(flags: InitFlags, filename: string): boolean {
  if (flags.force === true) return true;
  if (typeof flags.force === 'string') return flags.force === filename;
  return false;
}

export async function executeGenerate(
  item: GenerateItem,
  target: string,
  flags: InitFlags,
  step: number,
  total: number,
  provider: LLMProvider,
): Promise<void> {
  const filePath = join(target, item.filename);
  const label = `[${step}/${total}]`;

  console.log(`${label} Generating ${item.filename}`);
  console.log(`      Subsystem: ${item.subsystem}`);
  if (item.sourceFiles.length > 0) {
    console.log(`      Sources: ${item.sourceFiles.join(', ')}`);
  }
  console.log(`      Template: ${item.templateFile}`);

  const fileExists = existsSync(filePath);
  const forceThis = isForced(flags, item.filename);
  if (fileExists && !forceThis) {
    console.log(`      ⊜ Skipped — already exists (use --force ${item.filename} to overwrite)\n`);
    return;
  }

  const content = await generateArtifact(item, target, provider);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, 'utf-8');
  const lines = content.split('\n').length;
  console.log(`      ✓ Written — ${lines} lines\n`);
}

export async function executeImprove(
  item: ImproveItem,
  target: string,
  flags: InitFlags,
  step: number,
  total: number,
  provider: LLMProvider,
): Promise<void> {
  const filePath = join(target, item.filename);
  const label = `[${step}/${total}]`;

  console.log(`${label} Improving ${item.filename} → ${item.section}`);
  console.log(`      Missing: ${item.missing}`);

  if (!existsSync(filePath)) {
    console.log(`      ⊜ Skipped — file does not exist\n`);
    return;
  }

  const updatedContent = await improveArtifact(item, target, provider);
  writeFileSync(filePath, updatedContent, 'utf-8');
  console.log(`      ✓ Patched\n`);
}

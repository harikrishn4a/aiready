import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import ora from 'ora';
import type { LLMProvider } from '../utils/llm.js';

const SEA_GREEN = '\x1b[38;2;46;139;87m';
const RESET = '\x1b[0m';
const SPINNER_FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'].map((f) => `${SEA_GREEN}${f}${RESET}`);
import type { ArtifactPlan } from './planner.js';
import { loadTemplate, BLANK_TEMPLATE_FILES, type InitContext } from './generator.js';
import { rewriteToCanonical, sanitisePlaceholders } from './rewriter.js';
import { resolveArtifactSources } from './context.js';
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

function isTemplateCopy(artifact: ArtifactPlan): boolean {
  return Boolean(
    artifact.generateOnly ||
    (artifact.alwaysGenerate && BLANK_TEMPLATE_FILES.has(artifact.filename)),
  );
}

/**
 * Unified artifact executor — handles both GENERATE and IMPROVE.
 * - generateOnly / blank-template artifacts are written as direct template copies.
 * - all other artifacts are rewritten into canonical form via rewriteToCanonical.
 */
export async function executeArtifact(
  artifact: ArtifactPlan,
  target: string,
  flags: InitFlags,
  step: number,
  total: number,
  provider: LLMProvider,
  initContext?: InitContext,
): Promise<void> {
  const relPath = artifact.outputPath ?? artifact.filename;
  const filePath = join(target, relPath);
  const legacyRootPath = join(target, artifact.filename);
  const label = `[${step}/${total}]`;
  const fileExists = existsSync(filePath);
  const action = artifact.action === 'improve' ? 'Improving' : 'Generating';

  const destLabel = relPath === artifact.filename ? artifact.filename : `${artifact.filename} → ${relPath}`;
  console.log(`${label} ${action} ${destLabel}`);
  if (artifact.subsystem) console.log(`      Subsystem: ${artifact.subsystem}`);
  if (artifact.sourceFiles.length > 0) {
    console.log(`      Sources: ${artifact.sourceFiles.slice(0, 4).join(', ')}`);
  }

  // GENERATE skip semantics: existing file, not forced, not always-regenerate.
  if (artifact.action === 'generate' && fileExists && !isForced(flags, artifact.filename) && !artifact.alwaysGenerate) {
    console.log(`      ⊜ Skipped — already exists (use --force ${artifact.filename} to overwrite)\n`);
    return;
  }

  // IMPROVE skip semantics: nothing to improve if the file is absent.
  if (artifact.action === 'improve' && !fileExists) {
    console.log(`      ⊜ Skipped — file does not exist\n`);
    return;
  }

  // Template-copy artifacts never go through the LLM.
  if (isTemplateCopy(artifact)) {
    const template = cleanLLMOutput(loadTemplate(artifact.templateFile));
    const lines = writeArtifact(filePath, template, artifact.filename);
    console.log(`      ✓ Written — ${lines} lines (template copy)\n`);
    return;
  }

  // Prefer the canonical output file; fall back to a legacy root copy as the
  // basis for restructuring (its content is preserved, then written under docs/).
  const currentContent = fileExists
    ? readFileSync(filePath, 'utf-8')
    : existsSync(legacyRootPath)
      ? readFileSync(legacyRootPath, 'utf-8')
      : null;

  const spinner = ora({ text: `${action}...`, indent: 6, spinner: { interval: 120, frames: SPINNER_FRAMES } }).start();
  try {
    const resolved = resolveArtifactSources(
      target,
      artifact.subsystem,
      artifact.sourceFiles,
      initContext?.subsystemSources ?? {},
      initContext?.sourceContext ?? [],
    );

    const { content: rewritten, changes } = await rewriteToCanonical(
      {
        filename: artifact.filename,
        templateFile: artifact.templateFile,
        sourceFiles: resolved.sourceFiles,
        currentContent,
      },
      target,
      provider,
    );

    const finalContent = sanitisePlaceholders(rewritten);
    spinner.stop();

    if (changes.length > 0) {
      console.log(`      ↻ ${changes.join(', ')}`);
    }

    const lines = writeArtifact(filePath, finalContent, artifact.filename);
    console.log(`      ✓ Written — ${lines} lines\n`);
  } catch (error) {
    spinner.fail(`Failed: ${(error as Error).message}`);
    throw error;
  }
}

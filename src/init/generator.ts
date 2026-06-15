import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { SourceContextEntry } from './context.js';
import { loadExampleTemplate, resolveExamplesDir } from '../utils/examples-dir.js';

export interface InitContext {
  subsystemSources: Record<string, string[]>;
  sourceContext: SourceContextEntry[];
}

// Files whose canonical form is a direct template copy (generateOnly artifacts
// plus blank templates). These never go through the LLM rewrite.
export const BLANK_TEMPLATE_FILES = new Set([
  'TASK.md', 'feature-list-schema.json',
  'QUALITY.md', 'quality-document.md', 'evaluator_rubric.md',
  'clean-state-checklist.md', 'startup.md',
  'Makefile', 'scripts/init.sh', 'scripts/verify.sh',
]);

export function loadTemplate(templateFile: string): string {
  const fromExamples = loadExampleTemplate(templateFile);
  if (fromExamples) return fromExamples;
  const cwdPath = join(process.cwd(), templateFile);
  if (existsSync(cwdPath)) return readFileSync(cwdPath, 'utf-8').slice(0, 20000);
  return '';
}

export function assertTemplateLoaded(templateFile: string, template: string): void {
  if (template.trim().length > 0) return;
  const examplesDir = resolveExamplesDir();
  throw new Error(
    `ERROR: Template not found: ${templateFile} (looked in ${examplesDir})\n` +
    `WHY: Init cannot generate ${templateFile} without the canonical examples/ template structure\n` +
    `FIX: Reinstall aiready from a build that bundles dist/examples/, or run from the aiready repo after npm run build`,
  );
}

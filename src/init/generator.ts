import { readFileSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { ArtifactPlan } from './planner.js';
import type { SourceContextEntry } from './context.js';
import { resolveArtifactSources, formatGraphifyContext } from './context.js';
import { loadExampleTemplate, resolveExamplesDir } from '../utils/examples-dir.js';

export interface InitContext {
  subsystemSources: Record<string, string[]>;
  sourceContext: SourceContextEntry[];
}

const SYSTEM_PROMPT = `You are consolidating information from a messy repository into a
clean, canonical harness artifact for AI coding agents.

CRITICAL RULES:
- Follow the template structure EXACTLY — same sections, same headings
- Replace every {{PLACEHOLDER}} with real content extracted from sources
- Never leave placeholder text in output
- Never add sections not in the template
- Never remove sections from the template
- If information for a section is not found in sources, write "Not yet documented" rather than leaving it blank or inventing content
- Output the file content ONLY — no explanation, no markdown fences
- Keep output under 300 lines unless template requires more`;

const BLANK_TEMPLATE_FILES = new Set([
  'TASK.md', 'features.md', 'feature_list.json', 'feature-list-schema.json',
  'QUALITY.md', 'quality-document.md', 'evaluator_rubric.md',
  'clean-state-checklist.md', 'startup.md',
  'Makefile', 'scripts/init.sh', 'scripts/verify.sh',
]);

function readCapped(filePath: string, cap = 4000): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8').slice(0, cap);
}

function loadTemplate(templateFile: string): string {
  const fromExamples = loadExampleTemplate(templateFile);
  if (fromExamples) return fromExamples;
  const cwdPath = join(process.cwd(), templateFile);
  if (existsSync(cwdPath)) return readFileSync(cwdPath, 'utf-8').slice(0, 20000);
  return '';
}

function assertTemplateLoaded(templateFile: string, template: string): void {
  if (template.trim().length > 0) return;
  const examplesDir = resolveExamplesDir();
  throw new Error(
    `ERROR: Template not found: ${templateFile} (looked in ${examplesDir})\n` +
    `WHY: Init cannot generate ${templateFile} without the canonical examples/ template structure\n` +
    `FIX: Reinstall aiready from a build that bundles dist/examples/, or run from the aiready repo after npm run build`,
  );
}

async function detectTechStack(target: string): Promise<string> {
  const facts: string[] = [];

  const pkgPath = join(target, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
      facts.push('Package manager: npm/node');
      const scripts = Object.keys(pkg.scripts ?? {});
      if (scripts.length > 0) facts.push(`Scripts: ${scripts.join(', ')}`);
      const deps = Object.keys(pkg.dependencies ?? {}).slice(0, 10);
      if (deps.length > 0) facts.push(`Dependencies: ${deps.join(', ')}`);
    } catch {
      facts.push('Package manager: npm/node');
    }
  }

  if (existsSync(join(target, 'requirements.txt'))) {
    facts.push('Python project');
    const reqs = readCapped(join(target, 'requirements.txt'), 500);
    if (reqs) facts.push(`Key packages: ${reqs.split('\n').slice(0, 5).join(', ')}`);
  }

  if (existsSync(join(target, 'pyproject.toml'))) facts.push('Uses pyproject.toml');
  if (existsSync(join(target, 'go.mod'))) facts.push('Go project');
  if (existsSync(join(target, 'Cargo.toml'))) facts.push('Rust project');
  if (existsSync(join(target, 'docker-compose.yml'))) facts.push('Uses docker-compose');

  return facts.join('\n');
}

export async function generateArtifact(
  artifact: ArtifactPlan,
  target: string,
  provider: LLMProvider,
  initContext?: InitContext,
): Promise<string> {
  const template = loadTemplate(artifact.templateFile);
  assertTemplateLoaded(artifact.templateFile, template);

  if (artifact.generateOnly || (artifact.alwaysGenerate && BLANK_TEMPLATE_FILES.has(artifact.filename))) {
    return template;
  }

  const resolved = resolveArtifactSources(
    target,
    artifact.subsystem,
    artifact.sourceFiles,
    initContext?.subsystemSources ?? {},
    initContext?.sourceContext ?? [],
  );

  const sourceParts: string[] = [];
  const pkgContent = readCapped(join(target, 'package.json'));
  if (pkgContent && !resolved.sourceFiles.includes('package.json')) {
    sourceParts.push(`### package.json\n${pkgContent}`);
  }

  for (const sourceFile of resolved.sourceFiles) {
    const content = readCapped(join(target, sourceFile));
    if (content) sourceParts.push(`### ${sourceFile}\n${content}`);
  }

  const graphifyBlock = formatGraphifyContext(resolved.graphifyContext, artifact.subsystem);

  const techStackSummary = await detectTechStack(target);

  const userParts = [
    `Generate ${artifact.filename} for this repository.\n`,
    `This file must strictly follow this template:\n=== TEMPLATE START ===\n${template}\n=== TEMPLATE END ===\n`,
  ];

  if (sourceParts.length > 0) {
    userParts.push(`Extract relevant information from these source files to fill in each section of the template:\n\n${sourceParts.join('\n\n')}\n`);
  }

  if (graphifyBlock) {
    userParts.push(`${graphifyBlock}\n`);
  }

  if (techStackSummary) {
    userParts.push(`Tech stack context (use for Makefile, init.sh, verify.sh):\n${techStackSummary}`);
  }

  return provider.chat(SYSTEM_PROMPT, userParts.join('\n'), { fast: false });
}

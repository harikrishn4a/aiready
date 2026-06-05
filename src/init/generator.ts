import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { GenerateItem } from './parser.js';

const PACKAGE_ROOT = resolve(__dirname, '..');

const SYSTEM_PROMPT = `You are generating a harness artifact for an AI coding agent.
This file will be read by agents in future sessions to guide their work.

Rules:
- Follow the template structure exactly
- Replace all {{PLACEHOLDER}} sections with real content from sources
- Never output placeholder text
- Keep output under 300 lines
- Be specific — use real names, real commands, real module names from sources
- Output the file content only, no explanation, no markdown fences`;

function readCapped(filePath: string, cap = 4000): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8').slice(0, cap);
}

function loadTemplate(templateFile: string): string {
  const candidates = [
    resolve(PACKAGE_ROOT, templateFile),
    resolve(process.cwd(), templateFile),
  ];
  for (const p of candidates) {
    const content = readCapped(p, 20000);
    if (content !== null) return content;
  }
  return '';
}

export async function generateArtifact(
  item: GenerateItem,
  target: string,
  provider: LLMProvider,
): Promise<string> {
  const template = loadTemplate(item.templateFile);

  const sourceParts: string[] = [];
  const pkgPath = join(target, 'package.json');
  const pkg = readCapped(pkgPath);
  if (pkg) sourceParts.push(`### package.json\n${pkg}`);

  for (const sourceFile of item.sourceFiles) {
    if (sourceFile === 'package.json') continue;
    const content = readCapped(join(target, sourceFile));
    if (content) sourceParts.push(`### ${sourceFile}\n${content}`);
  }
  const sourceContext = sourceParts.join('\n\n');

  const userParts = [`Generate ${item.filename} for this repository.\n`];
  if (item.required) userParts.push(`Required sections:\n${item.required}\n`);
  if (template) userParts.push(`Template:\n${template}\n`);
  if (sourceContext) userParts.push(`Source context:\n${sourceContext}`);

  return provider.chat(SYSTEM_PROMPT, userParts.join('\n'), { fast: false });
}

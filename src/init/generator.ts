import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { GenerateItem } from './parser.js';

const PACKAGE_ROOT = resolve(__dirname, '..');

const SYSTEM_PROMPT = `You are generating a harness artifact for an AI coding agent.
Your output will be saved directly to disk and read by AI agents in future sessions.

Rules:
- Follow the template structure exactly
- Fill in all {{PLACEHOLDER}} sections with real content from sources
- Do not include placeholder text in output
- Keep the artifact focused and under 300 lines
- Use specific facts from source files, not generic descriptions
- Output only the file content, no explanation or commentary`;

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

function looksLikeFilePath(signal: string): boolean {
  return !signal.includes(' ') && !signal.endsWith('/');
}

function gatherSourceContext(item: GenerateItem, target: string): string {
  const parts: string[] = [];

  const pkgPath = join(target, 'package.json');
  const pkg = readCapped(pkgPath);
  if (pkg) parts.push(`### package.json\n${pkg}`);

  for (const signal of item.sourceSignals) {
    if (!looksLikeFilePath(signal)) continue;
    if (signal === 'package.json') continue;
    const content = readCapped(join(target, signal));
    if (content) parts.push(`### ${signal}\n${content}`);
  }

  return parts.join('\n\n');
}

export async function generateArtifact(
  item: GenerateItem,
  target: string,
  provider: LLMProvider,
): Promise<string> {
  const template = loadTemplate(item.templateFile);
  const sourceContext = gatherSourceContext(item, target);

  const userParts = [
    `Generate ${item.filename} for this repository.`,
    '',
  ];
  if (item.required) {
    userParts.push(`Required sections:\n${item.required}`, '');
  }
  if (template) {
    userParts.push(`Template to follow:\n${template}`, '');
  }
  if (sourceContext) {
    userParts.push(`Source context (use these to fill in real content):\n${sourceContext}`, '');
  }
  if (item.writePolicy.length > 0) {
    userParts.push(`Write policy:\n${item.writePolicy.join('\n')}`);
  }

  return provider.chat(SYSTEM_PROMPT, userParts.join('\n'));
}

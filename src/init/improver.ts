import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { ImproveItem } from './parser.js';

const SYSTEM_PROMPT = `You are improving a specific section of an existing harness artifact.
Make only the requested change. Do not modify other sections.
Output the complete updated file content.`;

function readCapped(filePath: string, cap = 4000): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8').slice(0, cap);
}

export async function improveArtifact(
  item: ImproveItem,
  target: string,
  provider: LLMProvider,
): Promise<string> {
  const filePath = join(target, item.filename);
  const currentContent = readFileSync(filePath, 'utf-8');

  const sourceParts: string[] = [];
  for (const sourceFile of item.sourceFiles) {
    const content = readCapped(join(target, sourceFile));
    if (content) sourceParts.push(`### ${sourceFile}\n${content}`);
  }

  const userParts = [
    `Improve the ${item.section} section of ${item.filename}.`,
    '',
    `What is missing: ${item.missing}`,
    `How to fix it: ${item.fix}`,
    '',
    `Current file content:\n${currentContent}`,
  ];
  if (sourceParts.length > 0) {
    userParts.push('', `Source context:\n${sourceParts.join('\n\n')}`);
  }
  userParts.push(
    '',
    `Output the complete updated file with only the ${item.section} section changed. Do not modify any other section.`,
  );

  return provider.chat(SYSTEM_PROMPT, userParts.join('\n'));
}

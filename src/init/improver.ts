import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import type { ArtifactPlan } from './planner.js';
import type { InitContext } from './generator.js';
import { resolveArtifactSources, formatGraphifyContext } from './context.js';

const SYSTEM_PROMPT = `You are improving an existing harness artifact to make it more useful for AI coding agents.
Consolidate information from source files into the artifact's relevant sections.

Rules:
- Preserve all existing useful content
- Add missing information from source files
- Follow the template structure for the artifact
- Output the complete updated file content only, no explanation
- Keep output under 300 lines`;

function readCapped(filePath: string, cap = 4000): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8').slice(0, cap);
}

export async function improveArtifact(
  artifact: ArtifactPlan,
  target: string,
  provider: LLMProvider,
  initContext?: InitContext,
): Promise<string> {
  // Always read fresh from disk — captures any edits from previous improve calls
  const filePath = join(target, artifact.filename);
  const currentContent = readFileSync(filePath, 'utf-8');

  const resolved = resolveArtifactSources(
    target,
    artifact.subsystem,
    artifact.sourceFiles,
    initContext?.subsystemSources ?? {},
    initContext?.sourceContext ?? [],
  );

  const sourceParts: string[] = [];
  for (const sourceFile of resolved.sourceFiles) {
    const content = readCapped(join(target, sourceFile));
    if (content) sourceParts.push(`### ${sourceFile}\n${content}`);
  }

  const graphifyBlock = formatGraphifyContext(resolved.graphifyContext, artifact.subsystem);

  const userParts = [
    `File to improve: ${artifact.filename}`,
    `Current score: ${artifact.currentScore ?? 'unknown'}/100`,
    `Reason for improvement: ${artifact.reason}`,
    '',
    `Current file content:\n${currentContent}`,
  ];
  if (sourceParts.length > 0) {
    userParts.push('', `Source context to extract from:\n${sourceParts.join('\n\n')}`);
  }
  if (graphifyBlock) {
    userParts.push('', graphifyBlock);
  }
  userParts.push(
    '',
    `Output the complete improved ${artifact.filename} with better content consolidated from sources.`,
  );

  return provider.chat(SYSTEM_PROMPT, userParts.join('\n'), { fast: false });
}

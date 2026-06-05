import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { parsePlanContent, isAlwaysGenerate } from './parser.js';

export interface ArtifactPlan {
  filename: string;
  action: 'generate' | 'improve' | 'skip';
  subsystem: string | null;
  templateFile: string;
  sourceFiles: string[];
  currentScore: number | null;
  reason: string;
  alwaysGenerate: boolean;
}

export interface InitPlan {
  overall: number;
  target: string;
  artifacts: ArtifactPlan[];
  subsystemSources: Record<string, string[]>;
  sourceContext: Array<{ path: string; subsystems: string[]; reason: string }>;
}

export async function buildInitPlan(planPath: string, target: string): Promise<InitPlan> {
  if (!existsSync(planPath)) {
    throw new Error(`Plan file not found: ${planPath}`);
  }

  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch {
    throw new Error(`Could not read plan file: ${planPath}`);
  }

  const parsed = parsePlanContent(content, target);
  if (!parsed) {
    throw new Error(`Plan file is missing Overall score: ${planPath}`);
  }

  const artifacts: ArtifactPlan[] = [];

  for (const item of parsed.generate) {
    const score = item.subsystem ? (parsed.subsystemScores[item.subsystem] ?? null) : null;
    artifacts.push({
      filename: item.filename,
      action: 'generate',
      subsystem: item.subsystem || null,
      templateFile: item.templateFile,
      sourceFiles: item.sourceFiles,
      currentScore: score,
      reason: item.required || 'generate from plan',
      alwaysGenerate: isAlwaysGenerate(item.filename),
    });
  }

  for (const item of parsed.improve) {
    const score = item.subsystem ? (parsed.subsystemScores[item.subsystem] ?? null) : null;
    artifacts.push({
      filename: item.filename,
      action: 'improve',
      subsystem: item.subsystem || null,
      templateFile: item.templateFile,
      sourceFiles: item.sourceFiles,
      currentScore: score,
      reason: item.fix || item.missing || 'improve from plan',
      alwaysGenerate: false,
    });
  }

  for (const item of parsed.skip) {
    artifacts.push({
      filename: item.filename,
      action: 'skip',
      subsystem: null,
      templateFile: '',
      sourceFiles: [],
      currentScore: item.score,
      reason: item.reason,
      alwaysGenerate: false,
    });
  }

  return {
    overall: parsed.overall,
    target: parsed.target,
    artifacts,
    subsystemSources: parsed.subsystemSources,
    sourceContext: parsed.sourceContext,
  };
}

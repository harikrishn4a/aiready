import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { parsePlanContent } from './parser.js';
import { CANONICAL_ARTIFACTS, isEmpty } from '../audit/remediation.js';
import type { CanonicalArtifactDef } from '../audit/remediation.js';

export interface ArtifactPlan {
  filename: string;
  action: 'generate' | 'improve' | 'skip';
  subsystem: string | null;
  templateFile: string;
  sourceFiles: string[];
  currentScore: number | null;
  reason: string;
  alwaysGenerate: boolean;
  generateOnly: boolean;
}

export interface InitPlan {
  overall: number;
  target: string;
  artifacts: ArtifactPlan[];
  subsystemSources: Record<string, string[]>;
  sourceContext: Array<{ path: string; subsystems: string[]; reason: string }>;
}

function getSourceFiles(
  artifact: CanonicalArtifactDef,
  subsystemSources: Record<string, string[]>,
  target: string,
): string[] {
  const subSources = artifact.subsystem ? (subsystemSources[artifact.subsystem] ?? []) : [];
  const defaults = artifact.defaultSources;
  const candidates = [...new Set([...subSources, ...defaults])];
  return candidates.filter(
    (f) => f !== artifact.filename && existsSync(join(target, f)),
  );
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

  for (const artifact of CANONICAL_ARTIFACTS) {
    const filePath = join(target, artifact.filename);
    const fileExists = existsSync(filePath);

    if (!fileExists) {
      artifacts.push({
        filename: artifact.filename,
        action: 'generate',
        subsystem: artifact.subsystem,
        templateFile: artifact.template,
        sourceFiles: getSourceFiles(artifact, parsed.subsystemSources, target),
        currentScore: artifact.subsystem ? (parsed.subsystemScores[artifact.subsystem] ?? null) : null,
        reason: 'file does not exist',
        alwaysGenerate: false,
        generateOnly: artifact.generateOnly,
      });
      continue;
    }

    if (artifact.generateOnly) {
      let fileContent = '';
      try { fileContent = readFileSync(filePath, 'utf-8'); } catch { /* ignore */ }
      if (isEmpty(fileContent)) {
        artifacts.push({
          filename: artifact.filename,
          action: 'generate',
          subsystem: artifact.subsystem,
          templateFile: artifact.template,
          sourceFiles: getSourceFiles(artifact, parsed.subsystemSources, target),
          currentScore: null,
          reason: 'file exists but is empty',
          alwaysGenerate: true,
          generateOnly: artifact.generateOnly,
        });
      } else {
        artifacts.push({
          filename: artifact.filename,
          action: 'skip',
          subsystem: artifact.subsystem,
          templateFile: artifact.template,
          sourceFiles: [],
          currentScore: null,
          reason: 'generate-only — file exists with content',
          alwaysGenerate: false,
          generateOnly: artifact.generateOnly,
        });
      }
      continue;
    }

    // Non-generateOnly: always improve if exists
    artifacts.push({
      filename: artifact.filename,
      action: 'improve',
      subsystem: artifact.subsystem,
      templateFile: artifact.template,
      sourceFiles: getSourceFiles(artifact, parsed.subsystemSources, target),
      currentScore: artifact.subsystem ? (parsed.subsystemScores[artifact.subsystem] ?? null) : null,
      reason: 'always improve',
      alwaysGenerate: false,
      generateOnly: artifact.generateOnly,
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

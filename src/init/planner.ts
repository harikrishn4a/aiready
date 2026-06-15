import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { readFile } from 'fs/promises';
import { parsePlanContent } from './parser.js';
import { CANONICAL_ARTIFACTS, isEmpty } from '../audit/remediation.js';
import type { CanonicalArtifactDef } from '../audit/remediation.js';
import { artifactOutputPath } from '../utils/layout.js';

export interface ArtifactPlan {
  filename: string;
  outputPath: string;   // relative path where the artifact is written (docs/… or root)
  action: 'generate' | 'improve' | 'skip';
  subsystem: string | null;
  templateFile: string;
  sourceFiles: string[];
  currentScore: number | null;
  reason: string;
  alwaysGenerate: boolean;
  generateOnly: boolean;
}

/** True if the artifact exists at its docs/ output path or a legacy root path. */
function artifactExists(target: string, filename: string): boolean {
  return existsSync(join(target, artifactOutputPath(filename))) || existsSync(join(target, filename));
}

/** Read the artifact from its output path, falling back to a legacy root path. */
function readArtifact(target: string, filename: string): string {
  for (const rel of [artifactOutputPath(filename), filename]) {
    const p = join(target, rel);
    if (existsSync(p)) {
      try { return readFileSync(p, 'utf-8'); } catch { /* ignore */ }
    }
  }
  return '';
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
    const outputPath = artifactOutputPath(artifact.filename);
    const fileExists = artifactExists(target, artifact.filename);

    if (!fileExists) {
      artifacts.push({
        filename: artifact.filename,
        outputPath,
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
      const fileContent = readArtifact(target, artifact.filename);
      if (isEmpty(fileContent)) {
        artifacts.push({
          filename: artifact.filename,
          outputPath,
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
          outputPath,
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
      outputPath,
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

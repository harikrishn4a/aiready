import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { findGraphifyOutput, rankGraphifyFiles } from '../utils/graphify.js';

const THIN_SOURCE_THRESHOLD = 500;
const GRAPHIFY_CONTEXT_LIMIT = 5;
const THIN_EXPAND_LIMIT = 5;

function readCapped(filePath: string, cap = 4000): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, 'utf-8').slice(0, cap);
}

export function sourcesAreThin(target: string, sourceFiles: string[]): boolean {
  if (sourceFiles.length === 0) return true;
  let total = 0;
  for (const f of sourceFiles) {
    const content = readCapped(join(target, f));
    if (content) total += content.trim().length;
  }
  return total < THIN_SOURCE_THRESHOLD;
}

export interface ResolvedSources {
  sourceFiles: string[];
  graphifyContext: Array<{ path: string; content: string }>;
  expanded: boolean;
}

export interface SourceContextEntry {
  path: string;
  subsystems: string[];
}

export function sourceContextForSubsystem(
  sourceContext: SourceContextEntry[],
  subsystem: string | null,
): string[] {
  if (!subsystem) return [];
  return sourceContext
    .filter((e) => e.subsystems.includes(subsystem))
    .map((e) => e.path);
}

export function resolveArtifactSources(
  target: string,
  subsystem: string | null,
  planSources: string[],
  subsystemSources: Record<string, string[]>,
  sourceContext: SourceContextEntry[] = [],
): ResolvedSources {
  const graphPath = findGraphifyOutput(target);
  let sourceFiles = [...planSources];
  let expanded = false;

  if (sourcesAreThin(target, sourceFiles)) {
    const fallbacks = subsystem && subsystemSources[subsystem]
      ? subsystemSources[subsystem]
      : [];
    for (const f of fallbacks) {
      if (!sourceFiles.includes(f)) sourceFiles.push(f);
    }
    for (const f of sourceContextForSubsystem(sourceContext, subsystem)) {
      if (!sourceFiles.includes(f)) sourceFiles.push(f);
    }
    // Include all SOURCE CONTEXT paths when still thin (e.g. CLAUDE.md tagged identity-only)
    if (sourcesAreThin(target, sourceFiles)) {
      for (const entry of sourceContext) {
        if (!sourceFiles.includes(entry.path)) sourceFiles.push(entry.path);
      }
    }
    if (graphPath) {
      const ranked = rankGraphifyFiles(target, graphPath, subsystem, THIN_EXPAND_LIMIT);
      for (const f of ranked) {
        if (!sourceFiles.includes(f)) {
          sourceFiles.push(f);
          expanded = true;
        }
      }
    }
  }

  const graphifyContext: Array<{ path: string; content: string }> = [];
  if (graphPath) {
    const ranked = rankGraphifyFiles(target, graphPath, subsystem, GRAPHIFY_CONTEXT_LIMIT);
    for (const filePath of ranked) {
      const content = readCapped(join(target, filePath));
      if (content) graphifyContext.push({ path: filePath, content });
    }
  }

  return { sourceFiles: [...new Set(sourceFiles)], graphifyContext, expanded };
}

export function formatGraphifyContext(
  graphifyContext: Array<{ path: string; content: string }>,
  subsystem: string | null,
): string {
  if (graphifyContext.length === 0) return '';
  const header = subsystem
    ? `## Graphify context (subsystem: ${subsystem})`
    : '## Graphify context';
  const parts = graphifyContext.map((f) => `### ${f.path}\n${f.content}`);
  return `${header}\n\n${parts.join('\n\n')}`;
}

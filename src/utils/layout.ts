import { join } from 'path';

/** Folder (relative to the target repo) where the audit writes its plan. */
export const PLAN_DIR = 'plan';

/** Folder (relative to the target repo) where init writes non-entry artifacts. */
export const DOCS_DIR = 'docs';

/** Absolute path to the remediation plan inside the target repo. */
export function planFilePath(target: string): string {
  return join(target, PLAN_DIR, 'plan.md');
}

/**
 * Markdown artifacts that MUST stay at the repo root because they are agent
 * entry points. Every other markdown artifact is placed under docs/.
 * Non-markdown artifacts (Makefile, scripts/*.sh, *.json) always stay where the
 * toolchain expects them (the repo root / scripts/).
 */
const ROOT_ENTRY_MD = new Set<string>([
  'AGENTS.md',
  'AGENT.md',
  'CLAUDE.md',
  '.github/copilot-instructions.md',
]);

/**
 * Resolve where a canonical artifact should be written, relative to the target
 * repo. Entry-point markdown and all non-markdown build artifacts stay at root;
 * every other markdown artifact moves under docs/.
 */
export function artifactOutputPath(filename: string): string {
  if (!filename.endsWith('.md')) return filename;     // Makefile, *.json, scripts/* stay put
  if (ROOT_ENTRY_MD.has(filename)) return filename;   // entry-point markdown stays at root
  return `${DOCS_DIR}/${filename}`;
}

/** True when the artifact is written under docs/ (i.e. not an entry/root file). */
export function isDocsArtifact(filename: string): boolean {
  return artifactOutputPath(filename) !== filename;
}

/** Absolute path to the gaps file written by Stage 3 analyze. */
export function gapsFilePath(target: string): string {
  return join(target, '.aiready', 'gaps.md');
}

/**
 * True for aiready's OWN remediation plan path (new plan/ or legacy .aiready/).
 * A bare user-authored `plan.md` at the repo root is NOT ours and is a valid source.
 */
export function isPlanPath(file: string): boolean {
  return (
    file === 'plan/plan.md' ||
    file.endsWith('/plan/plan.md') ||
    file === '.aiready/plan.md' ||
    file.endsWith('/.aiready/plan.md')
  );
}

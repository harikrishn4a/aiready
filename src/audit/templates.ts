import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';

export const TEMPLATE_SUBSYSTEM_MAP: Record<string, { primary: string[]; secondary: string[] }> = {
  identity: {
    primary: ['agents.md'],
    secondary: ['decisions.md'],
  },
  verification: {
    primary: ['Makefile', 'scripts/init.sh', 'scripts/verify.sh'],
    secondary: [],
  },
  state: {
    primary: ['progress.md', 'session-handoff.md'],
    secondary: ['features.md', 'feature-list.json', 'quality.md'],
  },
  memory: {
    primary: ['architecture.md', 'structure.md'],
    secondary: ['decisions.md'],
  },
  constraints: {
    primary: ['constraints.md'],
    secondary: [],
  },
};

export const CANONICAL_FILENAMES: Record<string, string> = {
  identity:     'AGENTS.md',
  verification: 'Makefile',
  state:        'PROGRESS.md',
  memory:       'ARCHITECTURE.md',
  constraints:  'CONSTRAINTS.md',
};

export interface LoadedTemplates {
  primary: Record<string, string>;
  secondary: Record<string, string>;
  sections: Record<string, string[]>;
}

export function extractSectionHeadings(content: string): string[] {
  return content
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.replace(/^## /, '').trim());
}

async function readTemplateFile(examplesDir: string, filename: string): Promise<string | null> {
  const p = join(resolve(examplesDir), filename);
  if (!existsSync(p)) return null;
  try {
    return await readFile(p, 'utf-8');
  } catch {
    return null;
  }
}

export async function loadTemplates(examplesDir: string): Promise<LoadedTemplates> {
  const primary: Record<string, string> = {};
  const secondary: Record<string, string> = {};
  const sections: Record<string, string[]> = {};

  for (const [subsystem, { primary: primaries, secondary: secondaries }] of Object.entries(TEMPLATE_SUBSYSTEM_MAP)) {
    const primaryParts: string[] = [];
    for (const file of primaries) {
      const content = await readTemplateFile(examplesDir, file);
      if (content !== null) {
        primaryParts.push(content);
        sections[file] = extractSectionHeadings(content);
      }
    }
    primary[subsystem] = primaryParts.join('\n\n');

    const secondaryParts: string[] = [];
    for (const file of secondaries) {
      const content = await readTemplateFile(examplesDir, file);
      if (content !== null) {
        secondaryParts.push(content);
        sections[file] = extractSectionHeadings(content);
      }
    }
    secondary[subsystem] = secondaryParts.join('\n\n');
  }

  return { primary, secondary, sections };
}

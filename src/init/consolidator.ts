import { readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';
import type { LLMProvider } from '../utils/llm.js';

const ENTRY_POINT_FILES = [
  { filename: 'CLAUDE.md',                       agent: 'Claude Code' },
  { filename: 'AGENT.md',                        agent: 'Generic'     },
  { filename: '.windsurfrules',                  agent: 'Windsurf'    },
  { filename: '.cursorrules',                    agent: 'Cursor'      },
  { filename: '.github/copilot-instructions.md', agent: 'Copilot'     },
];

const SHIMS: Record<string, string> = {
  'CLAUDE.md':                       '# CLAUDE.md\nSee AGENTS.md for project context and agent instructions.\n',
  'AGENT.md':                        '# AGENT.md\nSee AGENTS.md for project context and agent instructions.\n',
  '.windsurfrules':                  'See AGENTS.md for project context and agent instructions.\n',
  '.cursorrules':                    'See AGENTS.md for project context and agent instructions.\n',
  '.github/copilot-instructions.md': 'See AGENTS.md for project context and agent instructions.\n',
};

async function exists(filePath: string): Promise<boolean> {
  return existsSync(filePath);
}

async function extractUniqueContent(
  sourceContent: string,
  agentsMdContent: string,
  sourceFilename: string,
  provider: LLMProvider,
): Promise<string> {
  const system = `You are comparing two agent instruction files.
Identify content in the SOURCE file that is NOT already covered in the TARGET file.
Return only the unique content worth preserving.

Rules:
- Return empty string if nothing unique exists
- Do not return content already covered in TARGET (even if worded differently)
- Do not return generic boilerplate
- Return only the raw content to append, no explanation
- Maximum 50 lines`;

  const user = `SOURCE (${sourceFilename}):
${sourceContent.slice(0, 3000)}

TARGET (AGENTS.md):
${agentsMdContent.slice(0, 3000)}

Return unique content from SOURCE not covered in TARGET:`;

  return provider.chat(system, user, { fast: true });
}

export async function consolidateEntryPoints(
  target: string,
  provider: LLMProvider,
): Promise<void> {
  const agentsMdPath = join(target, 'AGENTS.md');

  if (!await exists(agentsMdPath)) {
    console.log('\n⚠ AGENTS.md not found — skipping entry point consolidation');
    return;
  }

  console.log('\nConsolidating entry points...');

  let agentsMdContent = await readFile(agentsMdPath, 'utf-8');

  for (const entry of ENTRY_POINT_FILES) {
    const filePath = join(target, entry.filename);
    if (!await exists(filePath)) continue;

    const content = await readFile(filePath, 'utf-8');

    // Skip if already a shim (short + references AGENTS.md)
    if (content.length < 100 && content.includes('AGENTS.md')) {
      console.log(`  ${entry.filename.padEnd(45)} already a shim — skipped`);
      continue;
    }

    const uniqueContent = await extractUniqueContent(
      content,
      agentsMdContent,
      entry.filename,
      provider,
    );

    if (uniqueContent && uniqueContent.trim().length > 0) {
      agentsMdContent += `\n\n<!-- Merged from ${entry.filename} -->\n${uniqueContent}`;
      await writeFile(agentsMdPath, agentsMdContent, 'utf-8');
      const mergedLines = uniqueContent.split('\n').length;
      console.log(`  ${entry.filename.padEnd(45)} merged ${mergedLines} lines → AGENTS.md`);
    } else {
      console.log(`  ${entry.filename.padEnd(45)} no unique content`);
    }

    // Write shim
    const shimDir = dirname(filePath);
    mkdirSync(shimDir, { recursive: true });
    await writeFile(filePath, SHIMS[entry.filename] ?? SHIMS['AGENT.md'], 'utf-8');
    console.log(`  ${entry.filename.padEnd(45)} → shim written`);
  }

  console.log('\n  Single entry point: AGENTS.md ✓');
}

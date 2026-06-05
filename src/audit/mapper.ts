import Anthropic from '@anthropic-ai/sdk';
import type { RepoFile } from './loader.js';

export type Subsystem = 'identity' | 'verification' | 'state' | 'memory' | 'constraints';

export interface FileMapping {
  path: string;
  subsystems: Subsystem[];
}

const MAPPER_SYSTEM = `You are classifying repository markdown files by AI agent harness subsystem.

There are exactly 5 subsystems:
- identity: File describes what the project is, its purpose, stack, version, or high-level structure
- verification: File contains commands to build/test/validate work, CI configuration, or runbooks
- state: File tracks current progress, session state, what is done, blocked, or next
- memory: File maps the architecture, module responsibilities, file structure, or code navigation
- constraints: File defines rules agents must follow, using MUST or MUST NOT language

For each file provided (path and first 200 characters), return which subsystems it belongs to.
A file can belong to multiple subsystems. Omit files with no harness relevance.

Return ONLY valid JSON with no explanation:
{"mappings":[{"path":"file.md","subsystems":["identity"]}]}`;

interface MapperResponse {
  mappings: Array<{ path: string; subsystems: string[] }>;
}

const VALID_SUBSYSTEMS = new Set<Subsystem>([
  'identity', 'verification', 'state', 'memory', 'constraints',
]);

function parseMapperResponse(text: string): FileMapping[] {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as MapperResponse;
    if (!Array.isArray(parsed.mappings)) return [];
    return parsed.mappings
      .filter((m) => typeof m.path === 'string' && Array.isArray(m.subsystems))
      .map((m) => ({
        path: m.path,
        subsystems: (m.subsystems as string[]).filter((s): s is Subsystem =>
          VALID_SUBSYSTEMS.has(s as Subsystem),
        ),
      }))
      .filter((m) => m.subsystems.length > 0);
  } catch {
    return [];
  }
}

export async function mapFiles(mdFiles: RepoFile[], apiKey: string): Promise<FileMapping[]> {
  if (mdFiles.length === 0) return [];

  const client = new Anthropic({ apiKey });

  const fileList = mdFiles
    .map((f) => `- path: ${f.path}\n  preview: ${JSON.stringify(f.preview)}`)
    .join('\n');

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: [
      {
        type: 'text',
        text: MAPPER_SYSTEM,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: `Classify these repository files:\n\n${fileList}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') return [];
  return parseMapperResponse(textBlock.text);
}

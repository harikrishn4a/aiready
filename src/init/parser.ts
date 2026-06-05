import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface GenerateItem {
  subsystem: string;
  filename: string;
  templateFile: string;
  sourceFiles: string[];
  required: string;
}

export interface ImproveItem {
  subsystem: string;
  filename: string;
  section: string;
  missing: string;
  fix: string;
  sourceFiles: string[];
}

export interface InitPlan {
  overall: number;
  generate: GenerateItem[];
  improve: ImproveItem[];
}

function isPlanFile(filename: string): boolean {
  return filename === 'plan.md' || filename.endsWith('.aiready/plan.md') || filename === '.aiready/plan.md';
}

function splitTokens(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseProperties(lines: string[]): Record<string, string> {
  const props: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^- ([a-z_]+):\s*(.*)/);
    if (m) props[m[1]] = m[2].trim();
  }
  return props;
}

function extractSection(content: string, heading: string): string {
  const marker = `\n## ${heading}\n`;
  const start = content.indexOf(marker);
  if (start === -1) return '';
  const body = start + marker.length;
  const next = content.indexOf('\n## ', body);
  return next === -1 ? content.slice(body) : content.slice(body, next);
}

function parseItems(section: string): Array<{ name: string; lines: string[] }> {
  const items: Array<{ name: string; lines: string[] }> = [];
  const parts = section.split(/^### /m);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    if (nl === -1) continue;
    const name = part.slice(0, nl).trim();
    if (!name || name === '(none)') continue;
    items.push({ name, lines: part.slice(nl + 1).split('\n') });
  }
  return items;
}

export async function parsePlan(planPath: string): Promise<InitPlan | null> {
  if (!existsSync(planPath)) return null;

  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch {
    return null;
  }

  const overallMatch = content.match(/^Overall:\s*(\d+)\/100/m);
  if (!overallMatch) return null;
  const overall = parseInt(overallMatch[1], 10);

  const generate: GenerateItem[] = [];
  for (const item of parseItems(extractSection(content, 'GENERATE'))) {
    if (isPlanFile(item.name)) continue;
    const p = parseProperties(item.lines);
    generate.push({
      filename: item.name,
      subsystem: p['subsystem'] ?? '',
      templateFile: p['template'] ?? '',
      sourceFiles: splitTokens(p['source_files'] ?? ''),
      required: p['required'] ?? '',
    });
  }

  const improve: ImproveItem[] = [];
  for (const item of parseItems(extractSection(content, 'IMPROVE'))) {
    if (isPlanFile(item.name)) continue;
    const p = parseProperties(item.lines);
    improve.push({
      filename: item.name,
      subsystem: p['subsystem'] ?? '',
      section: p['section'] ?? '',
      missing: p['missing'] ?? '',
      fix: p['fix'] ?? '',
      sourceFiles: splitTokens(p['source_files'] ?? ''),
    });
  }

  return { overall, generate, improve };
}

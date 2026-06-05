import { readFileSync, existsSync } from 'fs';

export interface GenerateItem {
  filename: string;
  subsystem: string;
  required: string;
  templateFile: string;
  sourceSignals: string[];
  writePolicy: string[];
}

export interface ImproveItem {
  filename: string;
  subsystem: string;
  section: string;
  missing: string;
  fix: string;
  templateSection: string;
  sourceFiles: string[];
  writePolicy: string[];
  findings: string[];
}

export interface InitPlan {
  overall: number;
  generate: GenerateItem[];
  improve: ImproveItem[];
}

const SUBSYSTEM_TO_SECTION: Record<string, string> = {
  identity: 'agent entry point',
  verification: 'verification section',
  state: 'current state section',
  memory: 'module map',
  constraints: 'hard constraints',
};

function splitTokens(value: string): string[] {
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseProperties(lines: string[]): Record<string, string | string[]> {
  const props: Record<string, string | string[]> = {};
  let listKey: string | null = null;

  for (const line of lines) {
    if (/^  - /.test(line)) {
      if (listKey) {
        (props[listKey] as string[]).push(line.replace(/^  - /, '').trim());
      }
      continue;
    }
    listKey = null;
    const m = line.match(/^- ([a-z_]+):\s*(.*)/);
    if (!m) continue;
    const key = m[1];
    const val = m[2].trim();
    if (val === '') {
      props[key] = [];
      listKey = key;
    } else {
      props[key] = val;
    }
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
    if (!name) continue;
    items.push({ name, lines: part.slice(nl + 1).split('\n') });
  }
  return items;
}

export function parsePlan(planPath: string): InitPlan | null {
  if (!existsSync(planPath)) return null;

  let content: string;
  try {
    content = readFileSync(planPath, 'utf-8');
  } catch {
    return null;
  }

  const overallMatch = content.match(/^Overall:\s*(\d+)\/100/m);
  if (!overallMatch) return null;
  const overall = parseInt(overallMatch[1], 10);

  const generate: GenerateItem[] = [];
  for (const item of parseItems(extractSection(content, 'Missing Artifacts'))) {
    const p = parseProperties(item.lines);
    generate.push({
      filename: item.name,
      subsystem: typeof p['subsystem'] === 'string' ? p['subsystem'] : '',
      required: typeof p['required_sections'] === 'string' ? p['required_sections'] : '',
      templateFile: typeof p['template'] === 'string' ? p['template'] : '',
      sourceSignals: typeof p['source_signals'] === 'string' ? splitTokens(p['source_signals']) : [],
      writePolicy: Array.isArray(p['write_policy']) ? (p['write_policy'] as string[]) : [],
    });
  }

  const improve: ImproveItem[] = [];
  for (const item of parseItems(extractSection(content, 'Weak Artifacts'))) {
    const p = parseProperties(item.lines);
    const subsystem = typeof p['subsystem'] === 'string' ? p['subsystem'] : '';
    improve.push({
      filename: item.name,
      subsystem,
      section: SUBSYSTEM_TO_SECTION[subsystem] ?? subsystem,
      missing: typeof p['missing'] === 'string' ? p['missing'] : '',
      fix: typeof p['fix'] === 'string' ? p['fix'] : '',
      templateSection: typeof p['template_section'] === 'string' ? p['template_section'] : '',
      sourceFiles: typeof p['use_as_sources'] === 'string' ? splitTokens(p['use_as_sources']) : [],
      writePolicy: Array.isArray(p['write_policy']) ? (p['write_policy'] as string[]) : [],
      findings: Array.isArray(p['findings']) ? (p['findings'] as string[]) : [],
    });
  }

  return { overall, generate, improve };
}

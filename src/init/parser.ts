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
  templateFile: string;
  sourceFiles: string[];
}

export interface SkipItem {
  filename: string;
  score: number | null;
  reason: string;
}

export interface SourceContextItem {
  path: string;
  subsystems: string[];
  reason: string;
}

export interface ParsedPlan {
  overall: number;
  target: string;
  generate: GenerateItem[];
  improve: ImproveItem[];
  skip: SkipItem[];
  subsystemScores: Record<string, number>;
  subsystemSources: Record<string, string[]>;
  sourceContext: SourceContextItem[];
}

/** @deprecated Use ParsedPlan via parsePlanContent — kept for backward compatibility */
export interface InitPlan {
  overall: number;
  generate: GenerateItem[];
  improve: ImproveItem[];
}

const BLANK_TEMPLATE_FILES = new Set([
  'TASK.md', 'features.md', 'feature_list.json', 'feature-list-schema.json',
  'QUALITY.md', 'quality-document.md', 'evaluator_rubric.md',
  'clean-state-checklist.md', 'startup.md',
  'Makefile', 'scripts/init.sh', 'scripts/verify.sh',
]);

const TEMPLATE_BY_FILENAME: Record<string, string> = {
  'AGENTS.md': 'examples/agents.md',
  'ARCHITECTURE.md': 'examples/architecture.md',
  'DECISIONS.md': 'examples/decisions.md',
  'structure.md': 'examples/structure.md',
  'CONSTRAINTS.md': 'examples/constraints.md',
  'PROGRESS.md': 'examples/progress.md',
  'SESSION-HANDOFF.md': 'examples/session-handoff.md',
  'TASK.md': 'examples/task.md',
  'features.md': 'examples/features.md',
  'feature_list.json': 'examples/feature-list.json',
  'feature-list-schema.json': 'examples/feature-list-schema.json',
  'QUALITY.md': 'examples/quality.md',
  'quality-document.md': 'examples/quality-document.md',
  'evaluator_rubric.md': 'examples/evaluator_rubric.md',
  'clean-state-checklist.md': 'examples/clean-state-checklist.md',
  'startup.md': 'examples/startup.md',
  'Makefile': 'examples/Makefile',
  'scripts/init.sh': 'examples/scripts/init.sh',
  'scripts/verify.sh': 'examples/scripts/verify.sh',
};

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

function parseSubsystemScores(content: string): Record<string, number> {
  const section = extractSection(content, 'SUBSYSTEM SCORES');
  const scores: Record<string, number> = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^- (\w+):\s*(\d+)/);
    if (m) scores[m[1]] = parseInt(m[2], 10);
  }
  return scores;
}

function parseSubsystemSources(content: string): Record<string, string[]> {
  const section = extractSection(content, 'SUBSYSTEM SOURCES');
  const sources: Record<string, string[]> = {};
  for (const line of section.split('\n')) {
    const m = line.match(/^- (\w+):\s*(.*)/);
    if (m) {
      sources[m[1]] = splitTokens(m[2]);
    }
  }
  return sources;
}

function parseSkipItems(section: string): SkipItem[] {
  const items: SkipItem[] = [];
  for (const line of section.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('- ') || trimmed === '- (none)') continue;
    const m = trimmed.match(/^- (.+?)(?: \((\d+)\/100\))? — (.+)$/);
    if (m) {
      items.push({
        filename: m[1].trim(),
        score: m[2] ? parseInt(m[2], 10) : null,
        reason: m[3].trim(),
      });
    }
  }
  return items;
}

function parseSourceContext(content: string): SourceContextItem[] {
  const section = extractSection(content, 'SOURCE CONTEXT');
  const items: SourceContextItem[] = [];
  for (const item of parseItems(section)) {
    const p = parseProperties(item.lines);
    const subsystems = p['subsystems']
      ? splitTokens(p['subsystems'])
      : p['subsystem']
        ? [p['subsystem']]
        : [];
    items.push({
      path: item.name,
      subsystems,
      reason: p['reason'] ?? '',
    });
  }
  return items;
}

function resolveTemplate(filename: string, fromPlan: string): string {
  if (fromPlan) return fromPlan;
  return TEMPLATE_BY_FILENAME[filename] ?? '';
}

export function isAlwaysGenerate(filename: string): boolean {
  return BLANK_TEMPLATE_FILES.has(filename);
}

export function parsePlanContent(content: string, fallbackTarget = ''): ParsedPlan | null {
  const overallMatch = content.match(/^Overall:\s*(\d+)\/100/m);
  if (!overallMatch) return null;
  const overall = parseInt(overallMatch[1], 10);

  const targetMatch = content.match(/^Target:\s*(.+)/m);
  const target = targetMatch ? targetMatch[1].trim() : fallbackTarget;

  const generate: GenerateItem[] = [];
  for (const item of parseItems(extractSection(content, 'GENERATE'))) {
    if (isPlanFile(item.name)) continue;
    const p = parseProperties(item.lines);
    generate.push({
      filename: item.name,
      subsystem: p['subsystem'] ?? '',
      templateFile: resolveTemplate(item.name, p['template'] ?? ''),
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
      templateFile: resolveTemplate(item.name, p['template'] ?? ''),
      sourceFiles: splitTokens(p['source_files'] ?? ''),
    });
  }

  const skip = parseSkipItems(extractSection(content, 'SKIP'));

  return {
    overall,
    target,
    generate,
    improve,
    skip,
    subsystemScores: parseSubsystemScores(content),
    subsystemSources: parseSubsystemSources(content),
    sourceContext: parseSourceContext(content),
  };
}

export async function parsePlan(planPath: string): Promise<InitPlan | null> {
  if (!existsSync(planPath)) return null;

  let content: string;
  try {
    content = await readFile(planPath, 'utf-8');
  } catch {
    return null;
  }

  const parsed = parsePlanContent(content);
  if (!parsed) return null;

  return {
    overall: parsed.overall,
    generate: parsed.generate,
    improve: parsed.improve,
  };
}

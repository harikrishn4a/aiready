import type { LLMProvider } from '../utils/llm.js';
import type { RepoFiles } from '../audit/loader.js';
import type { SourceFile, SourceFiles } from './loader.js';

export type GapType =
  | 'undocumented-module'
  | 'missing-behavior'
  | 'undocumented-constraint'
  | 'missing-data-flow';

export interface GapFinding {
  type: GapType;
  module: string;
  summary: string;
  proposedDoc: string;
  severity: 'high' | 'medium' | 'low';
  detectedBy: 'structural' | 'semantic';
}

export interface AnalysisResult {
  findings: GapFinding[];
  filesWalked: number;
  filesAnalyzed: number;
  usedGraphify: boolean;
}

const HARNESS_ARCH_CAP = 3000;
const HARNESS_AGENTS_CAP = 2000;
const HARNESS_CONSTRAINTS_CAP = 1000;

export function buildHarnessText(harnessFiles: Pick<RepoFiles, 'architectureMd' | 'agentsMd' | 'constraintsMd'>): string {
  const parts: string[] = [];
  if (harnessFiles.architectureMd) {
    parts.push(`=== ARCHITECTURE ===\n${harnessFiles.architectureMd.slice(0, HARNESS_ARCH_CAP)}`);
  }
  if (harnessFiles.agentsMd) {
    parts.push(`=== AGENTS ===\n${harnessFiles.agentsMd.slice(0, HARNESS_AGENTS_CAP)}`);
  }
  if (harnessFiles.constraintsMd) {
    parts.push(`=== CONSTRAINTS ===\n${harnessFiles.constraintsMd.slice(0, HARNESS_CONSTRAINTS_CAP)}`);
  }
  return parts.join('\n\n');
}

const VALID_GAP_TYPES = new Set<string>([
  'undocumented-module', 'missing-behavior', 'undocumented-constraint', 'missing-data-flow',
]);
const VALID_SEVERITIES = new Set<string>(['high', 'medium', 'low']);

interface RawSemanticResponse {
  has_gap?: boolean;
  gap_type?: string;
  summary?: string;
  severity?: string;
  proposed_doc?: string;
}

export function parseSemanticResponse(text: string): GapFinding | null {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let raw: RawSemanticResponse;
  try { raw = JSON.parse(match[0]) as RawSemanticResponse; } catch { return null; }
  if (!raw.has_gap) return null;
  const gapType = VALID_GAP_TYPES.has(raw.gap_type ?? '') ? raw.gap_type as GapType : 'undocumented-module';
  const severity = VALID_SEVERITIES.has(raw.severity ?? '') ? raw.severity as 'high' | 'medium' | 'low' : 'medium';
  return {
    type: gapType,
    module: '',
    summary: typeof raw.summary === 'string' ? raw.summary : 'Undocumented module.',
    proposedDoc: typeof raw.proposed_doc === 'string' ? raw.proposed_doc : '',
    severity,
    detectedBy: 'semantic',
  };
}

export function runStructuralPass(files: SourceFile[], harnessText: string): GapFinding[] {
  const lower = harnessText.toLowerCase();
  const findings: GapFinding[] = [];
  for (const file of files) {
    if (!lower.includes(file.moduleName.toLowerCase())) {
      findings.push({
        type: 'undocumented-module',
        module: file.path,
        summary: `Module "${file.moduleName}" not mentioned in any harness doc.`,
        proposedDoc: '',
        severity: 'high',
        detectedBy: 'structural',
      });
    }
  }
  return findings;
}

const SEMANTIC_SYSTEM_PROMPT = `You are a documentation gap analyzer for AI coding agents.
Given a source file and existing harness docs, identify what the code does
that is NOT documented or adequately explained for an AI agent navigating the codebase.
Then generate a compact file-level doc block (5–15 lines max).

FORMAT RULES — match the file extension EXACTLY, no exceptions:
- .py files  → Python module docstring ONLY. Start with triple-quote: """\\n<content>\\n"""
              Do NOT use /** */ or @file syntax in Python files.
- .ts .tsx .js .jsx files → JSDoc ONLY. Start with: /**\\n * @file <purpose>.
              Do NOT use triple-quote syntax in TypeScript/JavaScript files.
- All other extensions → plain comment using the language's native comment style.

CONTENT RULES (apply to all formats):
- Purpose statement: 1–2 sentences, what this module does (not how)
- Key exports: 2–4 bullets — name + one-line description of each export
- Critical rules: max 2 bullets, only for hidden constraints or non-obvious safety rules
- No change logs, no author names, no implementation details, no tutorials

Return ONLY valid JSON in this shape:
{
  "has_gap": true | false,
  "gap_type": "undocumented-module" | "missing-behavior" | "undocumented-constraint" | "missing-data-flow",
  "summary": "<one sentence: what is missing>",
  "severity": "high" | "medium" | "low",
  "proposed_doc": "<the compact doc block string, using the correct format for the file extension>"
}`;

export async function runSemanticPass(
  relevantFiles: SourceFile[],
  harnessText: string,
  provider: LLMProvider,
): Promise<GapFinding[]> {
  const findings: GapFinding[] = [];
  for (const file of relevantFiles) {
    const userMsg = `FILE: ${file.path} (extension: ${file.ext})\nREQUIRED DOC FORMAT: ${file.ext === '.py' ? 'Python triple-quote docstring """ ... """' : ['.ts', '.tsx', '.js', '.jsx'].includes(file.ext) ? 'JSDoc /** ... */' : `native comment for ${file.ext}`}\n\n=== SOURCE ===\n${file.fullContent}\n\n--- EXISTING HARNESS DOCS ---\n${harnessText}`;
    let response: string;
    try {
      response = await provider.chat(SEMANTIC_SYSTEM_PROMPT, userMsg, {
        temperature: 0,
        seed: 7,
        maxTokens: 1024,
      });
    } catch {
      continue;
    }
    const finding = parseSemanticResponse(response);
    if (finding) {
      findings.push({ ...finding, module: file.path });
    }
  }
  return findings;
}

export async function analyzeGaps(
  harnessFiles: RepoFiles,
  sourceFiles: SourceFiles,
  provider: LLMProvider,
): Promise<AnalysisResult> {
  const harnessText = buildHarnessText(harnessFiles);

  const structuralFindings = runStructuralPass(sourceFiles.all, harnessText);
  const semanticFindings = await runSemanticPass(sourceFiles.relevant, harnessText, provider);

  // Merge: semantic finding wins over structural for the same module
  const byModule = new Map<string, GapFinding>();
  for (const f of structuralFindings) byModule.set(f.module, f);
  for (const f of semanticFindings) {
    const existing = byModule.get(f.module);
    // Semantic with gap replaces structural; semantic with no gap keeps structural absence
    if (f.detectedBy === 'semantic') byModule.set(f.module, f);
    else if (!existing) byModule.set(f.module, f);
  }

  // Also include structural findings for modules NOT in relevant (not LLM-analyzed)
  const analyzedPaths = new Set(sourceFiles.relevant.map((f) => f.path));
  for (const f of structuralFindings) {
    if (!analyzedPaths.has(f.module) && !byModule.has(f.module)) {
      byModule.set(f.module, f);
    }
  }

  const findings = [...byModule.values()];

  return {
    findings,
    filesWalked: sourceFiles.all.length,
    filesAnalyzed: sourceFiles.relevant.length,
    usedGraphify: sourceFiles.usedGraphify,
  };
}

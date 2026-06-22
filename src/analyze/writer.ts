import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { gapsFilePath } from '../utils/layout.js';
import type { AnalysisResult, GapFinding } from './analyzer.js';

function renderFinding(f: GapFinding): string {
  const lines: string[] = [
    `### ${f.type}: ${f.module}`,
    `**Detected by:** ${f.detectedBy === 'structural' ? 'structural scan' : 'semantic analysis'}`,
    `**What's missing:** ${f.summary}`,
  ];
  if (f.proposedDoc) {
    const ext = f.module.split('.').pop() ?? '';
    const lang = ext === 'py' ? 'python' : ['ts', 'tsx', 'js', 'jsx'].includes(ext) ? 'typescript' : ext;
    lines.push(`**Proposed documentation:**`);
    lines.push(`\`\`\`${lang}`);
    lines.push(f.proposedDoc);
    lines.push('```');
  } else {
    lines.push(`**Proposed documentation:** *(run \`npx aiready fix --gaps\` to generate)*`);
  }
  return lines.join('\n');
}

export function renderGapsMd(result: AnalysisResult, targetDir: string, generatedAt: Date): string {
  const lines: string[] = [];
  lines.push(`# AIReady Analysis — Documentation Gaps`);
  lines.push(``);
  lines.push(`Generated: ${generatedAt.toISOString()}`);
  lines.push(`Target: ${targetDir}`);
  lines.push(`Files walked: ${result.filesWalked}  |  LLM-analyzed: ${result.filesAnalyzed}  |  Graphify: ${result.usedGraphify ? 'used' : 'not used'}`);
  lines.push(``);

  const structural = result.findings.filter((f) => f.detectedBy === 'structural').length;
  const semantic = result.findings.filter((f) => f.detectedBy === 'semantic').length;

  if (result.findings.length === 0) {
    lines.push(`## Summary`);
    lines.push(`No documentation gaps found. Repository appears well-documented.`);
    return lines.join('\n');
  }

  lines.push(`## Summary`);
  lines.push(`${result.findings.length} gap(s) found: ${structural} structural (not mentioned in any doc), ${semantic} semantic (inadequately documented).`);
  lines.push(``);
  lines.push(`---`);

  const byBucket: Record<string, GapFinding[]> = { high: [], medium: [], low: [] };
  for (const f of result.findings) byBucket[f.severity].push(f);

  for (const severity of ['high', 'medium', 'low'] as const) {
    const bucket = byBucket[severity];
    if (bucket.length === 0) continue;
    lines.push(``);
    lines.push(`## ${severity.toUpperCase()} SEVERITY`);
    for (const f of bucket) {
      lines.push(``);
      lines.push(renderFinding(f));
      lines.push(``);
      lines.push(`---`);
    }
  }

  lines.push(``);
  lines.push(`*Next: Run \`npx aiready fix --gaps\` to insert proposed documentation.*`);
  return lines.join('\n');
}

export function writeGaps(result: AnalysisResult, targetDir: string): string {
  const filePath = gapsFilePath(targetDir);
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, renderGapsMd(result, targetDir, new Date()), 'utf-8');
  return filePath;
}

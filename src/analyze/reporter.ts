import type { AnalysisResult, GapFinding } from './analyzer.js';

const SEPARATOR = '─'.repeat(54);

function severityLabel(s: GapFinding['severity']): string {
  return s === 'high' ? '[high]  ' : s === 'medium' ? '[medium]' : '[low]   ';
}

export function reportAnalysis(
  result: AnalysisResult,
  gapsPath: string,
  tokenUsage: number,
  detectedExtensions: Set<string>,
): void {
  const extList = [...detectedExtensions].sort().join(', ');
  const graphify = result.usedGraphify ? 'used' : 'not used';
  const tokenDisplay = tokenUsage >= 1000 ? `~${Math.ceil(tokenUsage / 1000)}k` : `~${tokenUsage}`;

  console.log(`\nAIReady — Analyze`);
  console.log(SEPARATOR);
  console.log(`Stack extensions: ${extList}`);
  console.log(`Files walked: ${result.filesWalked}  •  LLM-analyzed: ${result.filesAnalyzed}  •  Graphify: ${graphify}`);

  if (result.findings.length === 0) {
    console.log(`\nNo documentation gaps found. Repository appears well-documented.`);
    console.log(SEPARATOR);
    console.log(`Tokens used: ${tokenDisplay}`);
    console.log(`Written: ${gapsPath}`);
    return;
  }

  const structural = result.findings.filter((f) => f.detectedBy === 'structural');
  const semantic = result.findings.filter((f) => f.detectedBy === 'semantic');

  if (structural.length > 0) {
    console.log(`\nSTRUCTURAL GAPS  (not mentioned in any doc)  ── ${structural.length} file(s)`);
    const show = structural.slice(0, 8);
    for (const f of show) {
      console.log(`  ✗  ${f.module}`);
    }
    if (structural.length > 8) {
      console.log(`  ... and ${structural.length - 8} more`);
    }
  }

  if (semantic.length > 0) {
    console.log(`\nSEMANTIC GAPS  (inadequately documented)  ── ${semantic.length} finding(s)`);
    for (const f of semantic) {
      const label = severityLabel(f.severity);
      const mod = f.module.padEnd(36);
      console.log(`  ⚠  ${mod} ${label}  ${f.summary}`);
    }
  }

  console.log(`\n${SEPARATOR}`);
  console.log(`${result.findings.length} gap(s) total  •  Tokens used: ${tokenDisplay}`);
  console.log(`Written: ${gapsPath}`);
  console.log(`Run \`npx aiready fix --gaps\` to patch these gaps.`);
}

import { resolve } from 'path';
import { loadRepo } from '../audit/loader.js';
import { loadSourceFiles } from './loader.js';
import { analyzeGaps } from './analyzer.js';
import { reportAnalysis } from './reporter.js';
import { writeGaps } from './writer.js';
import { selectAuditConfig } from '../utils/prompt.js';
import { createProvider } from '../utils/llm.js';
import { withSpinner } from '../utils/spinner.js';

export interface AnalyzeOptions {
  provider?: string;
  model?: string;
}

export async function runAnalyze(target: string, opts: AnalyzeOptions): Promise<void> {
  const config = await selectAuditConfig({ provider: opts.provider, model: opts.model });
  const provider = createProvider(config.provider, config.apiKey, config.modelId);
  const targetDir = resolve(target);

  const harnessFiles = loadRepo(targetDir);
  const sourceFiles = loadSourceFiles(targetDir, harnessFiles.graphifyPath);

  if (sourceFiles.all.length === 0) {
    console.log('No source files found. Nothing to analyze.');
    return;
  }

  const result = await withSpinner(
    `Analyzing ${sourceFiles.relevant.length} file(s) semantically + ${sourceFiles.all.length} structural scan...`,
    true,
    () => analyzeGaps(harnessFiles, sourceFiles, provider),
  );


  const gapsPath = writeGaps(result, targetDir);
  const totalTokens = provider.getTotalTokens();
  reportAnalysis(result, gapsPath, totalTokens, sourceFiles.detectedExtensions);
}

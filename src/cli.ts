import 'dotenv/config';
import { Command } from 'commander';
import { runAudit } from './audit/index.js';

export const program = new Command();

program
  .name('aiready')
  .description('Audit repositories for AI agent readiness')
  .version('0.1.0');

program
  .command('audit')
  .description('Score a repository against the 5 AI-readiness subsystems')
  .option('-t, --target <dir>', 'target directory to audit', '.')
  .option('--json', 'output results as JSON', false)
  .option('--min-score <n>', 'exit 1 if overall score is below this threshold', '70')
  .option('--provider <name>', 'LLM provider: anthropic | openai | ollama (skips prompt)')
  .option('--model <id>', 'model ID (e.g. claude-sonnet-4-6, gpt-4o) — skips prompt')
  .action((opts: { target: string; json: boolean; minScore: string; provider?: string; model?: string }) => {
    runAudit(opts.target, {
      json: opts.json,
      minScore: parseInt(opts.minScore, 10),
      provider: opts.provider,
      model: opts.model,
    }).catch((err: unknown) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  });

// Parse only when run as CLI entry point, not when imported in tests
if (require.main === module) {
  program.parse(process.argv);
}

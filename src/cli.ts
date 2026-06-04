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
  .action((opts: { target: string; json: boolean; minScore: string }) => {
    runAudit(opts.target, {
      json: opts.json,
      minScore: parseInt(opts.minScore, 10),
    });
  });

// Skip parse when imported in tests
if (!process.env['VITEST']) {
  program.parse(process.argv);
}

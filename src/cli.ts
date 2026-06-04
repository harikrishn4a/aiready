import { Command } from 'commander';

export const program = new Command();

program
  .name('aiready')
  .description('Audit repositories for AI agent readiness')
  .version('0.1.0');

program
  .command('audit')
  .description('Score a repository against the 5 AI-readiness subsystems')
  .action(() => {
    console.log('audit command - not yet implemented');
  });

// Skip parse when imported in tests
if (!process.env['VITEST']) {
  program.parse(process.argv);
}

import 'dotenv/config';
import { Command } from 'commander';
import { runAudit } from './audit/index.js';
import { runInit } from './init/index.js';
import { runGraph } from './graph/index.js';
import { runAnalyze } from './analyze/index.js';
import { checkForUpdate } from './utils/update-check.js';
import pkg from '../package.json';

export const program = new Command();

program
  .name('aiready')
  .description('Audit repositories for AI agent readiness')
  .version(pkg.version);

program
  .command('graph')
  .description('Build a repo knowledge graph with graphify (installs it if missing)')
  .option('-t, --target <dir>', 'target directory', '.')
  .option('--backend <name>', 'graphify LLM backend: claude | openai | gemini | ollama (auto-detected from .env if omitted)')
  .option('--model <id>', 'graphify model id (backend-specific; uses the backend default if omitted)')
  .action((opts: { target: string; backend?: string; model?: string }) => {
    runGraph(opts.target, { backend: opts.backend, model: opts.model }).catch((err: unknown) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  });

program
  .command('audit')
  .description('Score a repository against the 5 AI-readiness subsystems')
  .option('-t, --target <dir>', 'target directory to audit', '.')
  .option('--json', 'output results as JSON', false)
  .option('--min-score <n>', 'exit 1 if overall score is below this threshold (CI opt-in)')
  .option('--provider <name>', 'LLM provider: anthropic | openai | ollama (skips prompt)')
  .option('--model <id>', 'model ID (e.g. claude-sonnet-4-6, gpt-4o) — skips prompt')
  .action((opts: { target: string; json: boolean; minScore?: string; provider?: string; model?: string }) => {
    runAudit(opts.target, {
      json: opts.json,
      minScore: opts.minScore === undefined ? undefined : parseInt(opts.minScore, 10),
      provider: opts.provider,
      model: opts.model,
    }).catch((err: unknown) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  });

program
  .command('init')
  .description('Generate missing harness artifacts from audit plan')
  .option('-t, --target <dir>', 'target directory', '.')
  .option('--provider <name>', 'LLM provider: anthropic | openai | ollama (skips prompt)')
  .option('--model <id>', 'model ID (e.g. claude-sonnet-4-6) — skips prompt')
  .option('--force [filename]', 'overwrite existing files (all, or specific filename)')
  .option('--dry-run', 'show what would be generated without writing')
  .option('--yes', 'skip confirmation prompt')
  .action((opts: { target: string; provider?: string; model?: string; force?: boolean | string; dryRun?: boolean; yes?: boolean }) => {
    runInit(opts.target, {
      provider: opts.provider,
      model: opts.model,
      force: opts.force,
      dryRun: opts.dryRun,
      yes: opts.yes,
    }).catch((err: unknown) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  });

program
  .command('analyze')
  .description('Find undocumented source code intent, writes .aiready/gaps.md')
  .option('-t, --target <dir>', 'target directory', '.')
  .option('--provider <name>', 'LLM provider: anthropic | openai | ollama (skips prompt)')
  .option('--model <id>', 'model ID (e.g. claude-sonnet-4-6) — skips prompt')
  .action((opts: { target: string; provider?: string; model?: string }) => {
    runAnalyze(opts.target, {
      provider: opts.provider,
      model: opts.model,
    }).catch((err: unknown) => {
      process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    });
  });

// Parse only when run as CLI entry point, not when imported in tests
if (require.main === module) {
  void checkForUpdate(pkg.name, pkg.version);
  program.parse(process.argv);
}

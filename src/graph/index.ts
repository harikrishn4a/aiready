import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { findGraphifyOutput } from '../utils/graphify.js';

export interface GraphOptions {
  /** graphify backend, e.g. claude | openai | gemini | ollama. Auto-detected if omitted. */
  backend?: string;
  /** graphify model id (backend-specific). Uses the backend default if omitted. */
  model?: string;
}

// graphify ships on PyPI as `graphifyy` (double-y); the CLI binary is `graphify`.
const PYPI_PACKAGE = 'graphifyy';
const CLI = 'graphify';
const DOCS = 'https://graphify.net';
const REPO = 'https://github.com/safishamsi/graphify';

function commandExists(cmd: string, args: string[]): boolean {
  try {
    const r = spawnSync(cmd, args, { stdio: 'ignore' });
    return !r.error;
  } catch {
    return false;
  }
}

function graphifyInstalled(): boolean {
  return commandExists(CLI, ['--version']) || commandExists(CLI, ['--help']);
}

// Try the common Python tool installers in order; inherit stdio so the user sees progress.
function tryInstallGraphify(): boolean {
  const installers: Array<[string, string[]]> = [
    ['uv', ['tool', 'install', PYPI_PACKAGE]],
    ['pipx', ['install', PYPI_PACKAGE]],
    ['pip3', ['install', PYPI_PACKAGE]],
    ['pip', ['install', PYPI_PACKAGE]],
  ];
  for (const [installer, args] of installers) {
    if (!commandExists(installer, ['--version'])) continue;
    console.log(`Installing graphify via ${installer}...`);
    const r = spawnSync(installer, args, { stdio: 'inherit' });
    if (!r.error && r.status === 0 && graphifyInstalled()) return true;
  }
  return false;
}

// Printed whenever the graph can't be created — graphify links + manual steps, and a
// reminder that audit still works without a graph (with reduced discovery precision).
function printGraphFallback(): void {
  process.stderr.write(
    '\nRepo graph was not created.\n\n' +
    'aiready audit works best WITH a graph (semantically-ranked source discovery), but it\n' +
    'also runs WITHOUT one — it falls back to a content scan of your markdown and config\n' +
    'files. The trade-off: discovery is less precise and may miss or mis-rank sources.\n\n' +
    'To create the graph manually (needs Python 3.10+):\n' +
    `  pipx install ${PYPI_PACKAGE}      # or: uv tool install ${PYPI_PACKAGE}\n` +
    '  graphify extract .              # writes graphify-out/ into the repo\n' +
    `  docs: ${DOCS}   |   ${REPO}\n` +
    'Then re-run `aiready audit`.\n',
  );
}

export async function runGraph(target: string, opts: GraphOptions = {}): Promise<void> {
  const targetDir = resolve(target);
  if (!existsSync(targetDir)) {
    process.stderr.write(
      `ERROR: Target directory not found: ${targetDir}\n` +
      'WHY:   aiready graph needs a real repository to analyse\n' +
      'FIX:   Run from inside a repo, or pass --target <dir>\n',
    );
    process.exit(1);
  }

  if (!graphifyInstalled()) {
    console.log('graphify not found on PATH — attempting install...\n');
    if (!tryInstallGraphify() && !graphifyInstalled()) {
      process.stderr.write(
        'ERROR: graphify is not installed and could not be installed automatically\n' +
        'WHY:   aiready graph wraps the graphify CLI to build the repo knowledge graph\n' +
        'FIX:   Install it manually (needs Python 3.10+): see below\n',
      );
      printGraphFallback();
      process.exit(1);
    }
  }

  // graphify auto-detects the backend from your env API keys (code-only repos run fully
  // offline). Pass --backend/--model only if the user chose one explicitly.
  const args = ['extract', '.'];
  if (opts.backend) args.push('--backend', opts.backend);
  if (opts.model) args.push('--model', opts.model);

  const using = opts.backend
    ? `backend: ${opts.backend}${opts.model ? `, model: ${opts.model}` : ''}`
    : 'backend: auto-detected from your .env API keys (offline for code-only repos)';
  console.log(`Building repo graph with graphify (${using})...`);
  console.log('This can take a few minutes on a large repo.\n');

  const result = spawnSync(CLI, args, { cwd: targetDir, stdio: 'inherit', env: process.env });

  if (result.error) {
    process.stderr.write(
      `\nERROR: Could not run graphify (${result.error.message})\n` +
      'WHY:   graphify may be installed to a directory that is not on your PATH\n' +
      'FIX:   Ensure the install location (e.g. ~/.local/bin) is on PATH, then re-run `aiready graph`\n',
    );
    printGraphFallback();
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(
      `\nERROR: graphify exited with status ${result.status ?? 'unknown'}\n` +
      'WHY:   graph generation failed — analysing docs/PDFs/images needs an LLM backend + API key\n' +
      'FIX:   Set an API key in your .env (ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY),\n' +
      '       or choose one with `aiready graph --backend <claude|openai|gemini|ollama> [--model <id>]`\n',
    );
    printGraphFallback();
    process.exit(1);
  }

  const out = findGraphifyOutput(targetDir);
  if (!out) {
    process.stderr.write('\nERROR: graphify finished but no graphify-out/graph.json was produced\n');
    printGraphFallback();
    process.exit(1);
  }

  console.log('\n✓ Repo graph created! (graphify-out/)');
  console.log('Next: `aiready audit` — aiready uses the graph to find the right source files.');
}

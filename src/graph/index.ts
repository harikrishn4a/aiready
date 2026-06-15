import { spawnSync } from 'child_process';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { findGraphifyOutput } from '../utils/graphify.js';

// graphify ships on PyPI as `graphifyy` (double-y); the CLI binary is `graphify`.
const PYPI_PACKAGE = 'graphifyy';
const CLI = 'graphify';

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

function failInstall(): never {
  process.stderr.write(
    'ERROR: graphify is not installed and could not be installed automatically\n' +
    'WHY:   aiready graph wraps the graphify CLI to build the repo knowledge graph\n' +
    'FIX:   Install it manually (needs Python 3.10+), then re-run `aiready graph`:\n' +
    `         pipx install ${PYPI_PACKAGE}\n` +
    `         # or: uv tool install ${PYPI_PACKAGE}\n` +
    '       Docs: https://graphify.net\n',
  );
  process.exit(1);
}

export async function runGraph(target: string): Promise<void> {
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
    if (!tryInstallGraphify()) {
      if (graphifyInstalled()) {
        // installed to a dir not on PATH (e.g. ~/.local/bin)
      } else {
        failInstall();
      }
    }
  }

  console.log('Building repo graph with graphify (this can take a few minutes)...\n');
  // graphify writes graphify-out/ into its working directory; run it inside the target.
  const result = spawnSync(CLI, ['.'], { cwd: targetDir, stdio: 'inherit', env: process.env });

  if (result.error) {
    process.stderr.write(
      `\nERROR: Could not run graphify (${result.error.message})\n` +
      'WHY:   graphify may be installed to a directory that is not on your PATH\n' +
      'FIX:   Ensure the install location (e.g. ~/.local/bin) is on PATH, then re-run `aiready graph`\n',
    );
    process.exit(1);
  }

  if (result.status !== 0) {
    process.stderr.write(
      `\nERROR: graphify exited with status ${result.status ?? 'unknown'}\n` +
      'WHY:   graph generation failed — analysing docs/PDFs/images needs an API key\n' +
      'FIX:   Set ANTHROPIC_API_KEY or OPENAI_API_KEY in your .env (code-only repos need no key),\n' +
      '       then re-run `aiready graph`. Docs: https://graphify.net\n',
    );
    process.exit(1);
  }

  const out = findGraphifyOutput(targetDir);
  if (!out) {
    process.stderr.write(
      '\nERROR: graphify finished but no graphify-out/graph.json was produced\n' +
      'WHY:   the graph output is missing — generation may have been skipped or written elsewhere\n' +
      'FIX:   Re-run `graphify .` inside the repo and confirm graphify-out/ is created\n',
    );
    process.exit(1);
  }

  console.log('\n✓ Repo graph created! (graphify-out/)');
  console.log('Next: `aiready audit` — aiready uses the graph to find the right source files.');
}

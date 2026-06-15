import { spawnSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { parse as parseDotenv } from 'dotenv';
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

// LLM SDKs live in graphify's optional extras; the right one must be installed into
// graphify's OWN isolated interpreter (not the user's project venv).
export const BACKEND_EXTRA: Record<string, string> = {
  claude: 'anthropic',
  openai: 'openai',
  gemini: 'gemini',
  ollama: 'ollama',
};

// Extras whose Python import module we know, so we can verify they're present.
const EXTRA_IMPORT: Record<string, string> = {
  anthropic: 'anthropic',
  openai: 'openai',
};

/** PyPI spec with the optional extra, e.g. "graphifyy[anthropic]". */
export function graphifyPackageSpec(extra?: string): string {
  return extra ? `${PYPI_PACKAGE}[${extra}]` : PYPI_PACKAGE;
}

/** Resolve which backend graphify will use, mirroring its key-priority order. */
export function detectBackendFromEnv(env: NodeJS.ProcessEnv): string | null {
  if (env['GEMINI_API_KEY'] || env['GOOGLE_API_KEY']) return 'gemini';
  if (env['ANTHROPIC_API_KEY']) return 'claude';
  if (env['OPENAI_API_KEY']) return 'openai';
  if (env['OLLAMA_BASE_URL'] || env['OLLAMA_HOST']) return 'ollama';
  return null;
}

function commandExists(cmd: string, args: string[]): boolean {
  try {
    return !spawnSync(cmd, args, { stdio: 'ignore' }).error;
  } catch {
    return false;
  }
}

function graphifyInstalled(): boolean {
  return commandExists(CLI, ['--version']) || commandExists(CLI, ['--help']);
}

/** Merge the target repo's own .env (if any) under the current process env. */
function envForGraphify(targetDir: string): NodeJS.ProcessEnv {
  const dotenvPath = join(targetDir, '.env');
  if (!existsSync(dotenvPath)) return process.env;
  try {
    return { ...parseDotenv(readFileSync(dotenvPath, 'utf8')), ...process.env };
  } catch {
    return process.env;
  }
}

/** Find the Python interpreter behind the `graphify` launcher (via its shebang). */
function resolveGraphifyPython(): string | null {
  const which = spawnSync('which', [CLI], { encoding: 'utf8' });
  const binPath = which.status === 0 ? which.stdout.trim() : '';
  if (!binPath || !existsSync(binPath)) return null;
  try {
    const shebang = readFileSync(binPath, 'utf8').split('\n')[0] ?? '';
    const m = shebang.match(/^#!\s*(\S+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

function pythonCanImport(python: string, mod: string): boolean {
  return spawnSync(python, ['-c', `import ${mod}`], { stdio: 'ignore' }).status === 0;
}

/** Install (or upgrade) graphify, bundling the optional LLM extra into its own env. */
function tryInstallGraphify(extra?: string): boolean {
  const spec = graphifyPackageSpec(extra);
  const installers: Array<[string, string[]]> = [
    ['uv', ['tool', 'install', '--force', spec]],
    ['pipx', ['install', '--force', spec]],
    ['pip3', ['install', '--upgrade', spec]],
    ['pip', ['install', '--upgrade', spec]],
  ];
  for (const [installer, args] of installers) {
    if (!commandExists(installer, ['--version'])) continue;
    console.log(`Installing ${spec} via ${installer}...`);
    const r = spawnSync(installer, args, { stdio: 'inherit' });
    if (!r.error && r.status === 0 && graphifyInstalled()) return true;
  }
  return false;
}

/** Ensure the backend's SDK is importable in graphify's interpreter; reinstall if not. */
function ensureGraphifyBackendDeps(extra: string): void {
  const mod = EXTRA_IMPORT[extra];
  if (!mod) return; // unknown import module — rely on the extra install
  const python = resolveGraphifyPython();
  if (!python) return; // can't introspect (e.g. compiled launcher) — skip precheck
  if (!pythonCanImport(python, mod)) {
    console.log(`graphify is missing the '${mod}' SDK in its environment — installing ${graphifyPackageSpec(extra)}...`);
    tryInstallGraphify(extra);
  }
}

// Printed whenever the graph can't be created — graphify links + manual steps, and a
// reminder that audit still works without a graph (with reduced discovery precision).
function printGraphFallback(extra?: string): void {
  process.stderr.write(
    '\nRepo graph was not created.\n\n' +
    'aiready audit works best WITH a graph (semantically-ranked source discovery), but it\n' +
    'also runs WITHOUT one — it falls back to a content scan of your markdown and config\n' +
    'files. The trade-off: discovery is less precise and may miss or mis-rank sources.\n\n' +
    'To create the graph manually (needs Python 3.10+):\n' +
    `  uv tool install --force "${graphifyPackageSpec(extra ?? 'anthropic')}"   # or: pipx install --force ...\n` +
    '  graphify extract .                       # writes graphify-out/ into the repo\n' +
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

  const env = envForGraphify(targetDir);
  // Resolve the backend (explicit flag wins) and the extra that graphify's env needs.
  const backend = opts.backend ?? detectBackendFromEnv(env) ?? undefined;
  const extra = backend ? BACKEND_EXTRA[backend] : undefined;

  if (!backend) {
    console.log('No LLM API key detected — building a code-only graph (docs/PDFs/images');
    console.log('will not be semantically analysed). Add a key to .env or pass --backend for more.\n');
  }

  // Install graphify WITH the right extra so the SDK lives in graphify's own interpreter.
  if (!graphifyInstalled()) {
    console.log('graphify not found on PATH — installing...\n');
    if (!tryInstallGraphify(extra) && !graphifyInstalled()) {
      process.stderr.write(
        'ERROR: graphify is not installed and could not be installed automatically\n' +
        'WHY:   aiready graph wraps the graphify CLI to build the repo knowledge graph\n' +
        'FIX:   Install it manually (needs Python 3.10+): see below\n',
      );
      printGraphFallback(extra);
      process.exit(1);
    }
  } else if (extra) {
    // Already installed — make sure the backend SDK is present in graphify's env.
    ensureGraphifyBackendDeps(extra);
  }

  const args = ['extract', '.'];
  if (backend) args.push('--backend', backend);
  if (opts.model) args.push('--model', opts.model);

  const using = backend
    ? `backend: ${backend}${opts.model ? `, model: ${opts.model}` : ''}`
    : 'code-only (no LLM backend)';
  console.log(`Building repo graph with graphify (${using})...`);
  console.log('This can take a few minutes on a large repo.\n');

  const result = spawnSync(CLI, args, { cwd: targetDir, stdio: 'inherit', env });

  if (result.error) {
    process.stderr.write(
      `\nERROR: Could not run graphify (${result.error.message})\n` +
      'WHY:   graphify may be installed to a directory that is not on your PATH\n' +
      'FIX:   Ensure the install location (e.g. ~/.local/bin) is on PATH, then re-run `aiready graph`\n',
    );
    printGraphFallback(extra);
    process.exit(1);
  }

  if (result.status !== 0) {
    // Classify the failure: missing SDK in graphify's env vs missing/invalid key vs other.
    const mod = extra ? EXTRA_IMPORT[extra] : undefined;
    const python = resolveGraphifyPython();
    const sdkMissing = Boolean(mod && python && !pythonCanImport(python, mod));

    if (sdkMissing) {
      process.stderr.write(
        `\nERROR: graphify's Python environment is missing the '${mod}' package\n` +
        `WHY:   the '${backend}' backend needs the ${graphifyPackageSpec(extra)} extra in graphify's own env\n` +
        `FIX:   uv tool install --force "${graphifyPackageSpec(extra)}"  (or pipx install --force ...), then re-run\n`,
      );
    } else {
      process.stderr.write(
        `\nERROR: graphify exited with status ${result.status ?? 'unknown'}\n` +
        'WHY:   graph generation failed — likely a missing/invalid API key for the chosen backend,\n' +
        '       or a backend SDK missing from graphify\'s environment\n' +
        'FIX:   confirm a valid key in .env (e.g. ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY),\n' +
        '       or pick one with --backend <claude|openai|gemini|ollama> [--model <id>]\n',
      );
    }
    printGraphFallback(extra);
    process.exit(1);
  }

  const out = findGraphifyOutput(targetDir);
  if (!out) {
    process.stderr.write('\nERROR: graphify finished but no graphify-out/graph.json was produced\n');
    printGraphFallback(extra);
    process.exit(1);
  }

  console.log('\n✓ Repo graph created! (graphify-out/)');
  console.log('Next: `aiready audit` — aiready uses the graph to find the right source files.');
}

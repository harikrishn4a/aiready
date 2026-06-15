import { exists, readFile } from './fs.js';
import { join } from 'path';

export type PackageManager = 'npm' | 'yarn' | 'pnpm' | 'unknown';

export function detectPackageManager(targetDir: string): PackageManager {
  if (exists(join(targetDir, 'pnpm-lock.yaml'))) return 'pnpm';
  if (exists(join(targetDir, 'yarn.lock'))) return 'yarn';
  if (exists(join(targetDir, 'package-lock.json'))) return 'npm';
  return 'unknown';
}

/**
 * Best-effort stack detection used to make generated Makefile / scripts / startup.md
 * match the project's real toolchain instead of the npm-flavoured template defaults.
 * Returns a concise factual summary for the LLM — it does NOT hard-code commands.
 */
export function detectStack(targetDir: string): string {
  const facts: string[] = [];
  const has = (f: string): boolean => exists(join(targetDir, f));

  // ── Node / JS-TS ──────────────────────────────────────────────────────────
  if (has('package.json')) {
    facts.push(`Language/runtime: Node.js (package.json present; package manager: ${detectPackageManager(targetDir)})`);
    const raw = readFile(join(targetDir, 'package.json'));
    if (raw) {
      try {
        const pkg = JSON.parse(raw) as { scripts?: Record<string, string>; dependencies?: Record<string, string> };
        const scripts = Object.keys(pkg.scripts ?? {});
        if (scripts.length > 0) facts.push(`package.json scripts: ${scripts.join(', ')} (use these via the package manager)`);
        const deps = Object.keys(pkg.dependencies ?? {}).slice(0, 12);
        if (deps.length > 0) facts.push(`Key dependencies: ${deps.join(', ')}`);
      } catch { /* ignore malformed package.json */ }
    }
    if (has('tsconfig.json')) facts.push('TypeScript: tsconfig.json present → typecheck with tsc --noEmit');
  }

  // ── Python ────────────────────────────────────────────────────────────────
  if (has('requirements.txt') || has('pyproject.toml') || has('setup.py')) {
    const installer = has('pyproject.toml') ? 'pip install . (pyproject.toml)' : 'pip install -r requirements.txt';
    facts.push(`Language/runtime: Python (install with ${installer})`);
    if (has('pytest.ini') || has('conftest.py') || has('tox.ini')) facts.push('Tests: pytest config present → run tests with pytest');
    if (has('ruff.toml') || has('.ruff.toml')) facts.push('Lint: ruff configured → lint with ruff check .');
    const req = readFile(join(targetDir, 'requirements.txt'));
    if (req) {
      const pkgs = req.split('\n').map((l) => l.split(/[<>=!~ ]/)[0].trim()).filter(Boolean).slice(0, 12);
      if (pkgs.length > 0) facts.push(`Key packages: ${pkgs.join(', ')}`);
      if (/fastapi/i.test(req)) facts.push('Web framework: FastAPI → dev server typically `uvicorn <app>:app --reload`');
      if (/django/i.test(req)) facts.push('Web framework: Django → dev server `python manage.py runserver`');
      if (/flask/i.test(req)) facts.push('Web framework: Flask');
    }
  }

  // ── Other ecosystems ────────────────────────────────────────────────────────
  if (has('go.mod')) facts.push('Language/runtime: Go (go mod download / go test ./... / go build ./...)');
  if (has('Cargo.toml')) facts.push('Language/runtime: Rust (cargo build / cargo test / cargo clippy)');
  if (has('Gemfile')) facts.push('Language/runtime: Ruby (bundle install / rspec or rake test)');
  if (has('Makefile')) facts.push('An existing Makefile is present — reuse its target names where sensible');
  if (has('docker-compose.yml') || has('compose.yml')) facts.push('Uses docker-compose');

  // ── Existing dev/verify scripts worth reusing ──────────────────────────────
  for (const s of ['dev.sh', 'run.sh', 'start.sh', 'scripts/dev.sh', 'run_migrations.sh']) {
    if (has(s)) facts.push(`Existing script: ${s}`);
  }

  return facts.length > 0 ? facts.join('\n') : 'No recognised stack files found — keep commands generic.';
}

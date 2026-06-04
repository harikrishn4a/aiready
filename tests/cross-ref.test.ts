import { describe, it, expect } from 'vitest';
import { crossRef } from '../src/audit/cross-ref';
import type { RepoFiles } from '../src/audit/loader';

function makeFiles(overrides: Partial<RepoFiles> = {}): RepoFiles {
  return {
    agentsMd: null,
    architectureMd: null,
    constraintsMd: null,
    progressMd: null,
    sessionHandoffMd: null,
    packageJsonRaw: null,
    packageJson: null,
    srcDirs: [],
    rootFiles: [],
    progressMdModifiedAt: null,
    targetDir: '/tmp/test',
    ...overrides,
  };
}

const AGENTS_WITH_COMMANDS = `# AGENTS.md
## Verification
\`\`\`bash
npm run build
npm run typecheck
npm run lint
npm test
\`\`\`
`;

const ARCH_WITH_MODULES = `# ARCHITECTURE.md
\`\`\`
src/
  audit/        ← Stage 1 scoring
  utils/        ← shared helpers
\`\`\`
`;

describe('crossRef — command checks', () => {
  it('fails when no AGENTS.md', () => {
    const result = crossRef(makeFiles());
    const check = result.checks.find((c) => c.name === 'commands-in-agents-exist-in-package');
    expect(check?.passed).toBe(false);
  });

  it('passes when AGENTS.md has no bash blocks', () => {
    const result = crossRef(makeFiles({ agentsMd: '# AGENTS\nsome text' }));
    const checks = result.checks.filter((c) => c.name === 'commands-in-agents-exist-in-package');
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('passes when all commands in AGENTS.md exist in package.json', () => {
    const result = crossRef(
      makeFiles({
        agentsMd: AGENTS_WITH_COMMANDS,
        packageJson: {
          scripts: { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint', test: 'vitest' },
        },
      }),
    );
    const checks = result.checks.filter((c) => c.name === 'commands-in-agents-exist-in-package');
    expect(checks.every((c) => c.passed)).toBe(true);
  });

  it('fails for each command missing from package.json', () => {
    const result = crossRef(
      makeFiles({
        agentsMd: AGENTS_WITH_COMMANDS,
        packageJson: { scripts: { build: 'tsc' } }, // missing typecheck, lint
      }),
    );
    const failed = result.checks.filter(
      (c) => c.name === 'commands-in-agents-exist-in-package' && !c.passed,
    );
    expect(failed.length).toBe(2); // typecheck and lint missing
    expect(failed.some((c) => c.detail.includes('typecheck'))).toBe(true);
    expect(failed.some((c) => c.detail.includes('lint'))).toBe(true);
  });

  it('only extracts commands from bash code blocks', () => {
    const agentsMd = '# Docs\nnpm run build mentioned in prose\n```bash\nnpm run test\n```';
    const result = crossRef(
      makeFiles({ agentsMd, packageJson: { scripts: { test: 'vitest' } } }),
    );
    const failed = result.checks.filter(
      (c) => c.name === 'commands-in-agents-exist-in-package' && !c.passed,
    );
    expect(failed.length).toBe(0); // 'build' in prose is not extracted
  });
});

describe('crossRef — module checks', () => {
  it('fails when no ARCHITECTURE.md', () => {
    const result = crossRef(makeFiles());
    const check = result.checks.find((c) => c.name === 'architecture-modules-match-src');
    expect(check?.passed).toBe(false);
  });

  it('passes when no annotated modules in ARCHITECTURE.md', () => {
    const result = crossRef(makeFiles({ architectureMd: '# Arch\nsome text only' }));
    const check = result.checks.find((c) => c.name === 'architecture-modules-match-src');
    expect(check?.passed).toBe(true);
  });

  it('passes when all documented modules exist in src/', () => {
    const result = crossRef(
      makeFiles({
        architectureMd: ARCH_WITH_MODULES,
        srcDirs: ['audit', 'utils'],
      }),
    );
    const check = result.checks.find((c) => c.name === 'architecture-modules-match-src');
    expect(check?.passed).toBe(true);
  });

  it('fails when a documented module is missing from src/', () => {
    const result = crossRef(
      makeFiles({
        architectureMd: ARCH_WITH_MODULES,
        srcDirs: ['audit'], // utils missing
      }),
    );
    const check = result.checks.find((c) => c.name === 'architecture-modules-match-src');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('utils');
  });
});

describe('crossRef — progress freshness', () => {
  it('fails when no PROGRESS.md', () => {
    const result = crossRef(makeFiles());
    const check = result.checks.find((c) => c.name === 'progress-md-is-fresh');
    expect(check?.passed).toBe(false);
  });

  it('passes when PROGRESS.md modified today', () => {
    const result = crossRef(makeFiles({ progressMdModifiedAt: new Date() }));
    const check = result.checks.find((c) => c.name === 'progress-md-is-fresh');
    expect(check?.passed).toBe(true);
  });

  it('fails when PROGRESS.md modified more than 7 days ago', () => {
    const stale = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    const result = crossRef(makeFiles({ progressMdModifiedAt: stale }));
    const check = result.checks.find((c) => c.name === 'progress-md-is-fresh');
    expect(check?.passed).toBe(false);
    expect(check?.detail).toContain('days ago');
  });
});

describe('crossRef — result structure', () => {
  it('returns a checks array', () => {
    expect(crossRef(makeFiles()).checks).toBeInstanceOf(Array);
  });

  it('each check has name, passed, detail', () => {
    crossRef(makeFiles()).checks.forEach((c) => {
      expect(typeof c.name).toBe('string');
      expect(typeof c.passed).toBe('boolean');
      expect(typeof c.detail).toBe('string');
    });
  });
});

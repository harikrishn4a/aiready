import { describe, it, expect } from 'vitest';
import { scoreRepo } from '../src/audit/scorer';
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

const GOOD_AGENTS_MD = `# AGENTS.md

## What this is
A well-harnessed CLI tool version v1.0.0 for doing things with code.
This project helps developers build better software faster by automating tasks.
It reads source code, analyses it, and generates reports for developers to review.

## Stack
- Node.js 20+, TypeScript
- Commander.js
- Vitest

## Repo structure
\`\`\`
src/
  audit/
  utils/
\`\`\`

## Verification commands
\`\`\`bash
npm run build
npm run typecheck
npm run lint
npm test
\`\`\`

## Constraints — never do these
- MUST NOT write files without confirmation
- MUST run verification before claiming completion
- MUST NOT add dependencies without recording the decision
`;

const GOOD_ARCH_MD = `# ARCHITECTURE.md

## Module map

\`\`\`
src/
  cli.ts        ← Commander entrypoint
  audit/        ← Stage 1 scoring logic
    index.ts    ← audit command handler
    loader.ts   ← reads repo files
    scorer.ts   ← pure scoring function
  utils/        ← shared helpers
    fs.ts       ← filesystem helpers
\`\`\`

This is a detailed architecture document explaining module responsibilities
and data flow. Each module has clear boundaries and a single responsibility.
The tool never modifies files without explicit user confirmation.
`;

describe('scoreRepo — empty input', () => {
  it('returns 0 overall for empty repo', () => {
    const result = scoreRepo(makeFiles());
    expect(result.overall).toBe(0);
  });

  it('returns 0 for each subsystem with empty input', () => {
    const result = scoreRepo(makeFiles());
    expect(result.identity.score).toBe(0);
    expect(result.verification.score).toBe(0);
    expect(result.state.score).toBe(0);
    expect(result.memory.score).toBe(0);
    expect(result.constraints.score).toBe(0);
  });

  it('provides gaps for each missing subsystem', () => {
    const result = scoreRepo(makeFiles());
    expect(result.identity.gaps.length).toBeGreaterThan(0);
    expect(result.state.gaps.length).toBeGreaterThan(0);
    expect(result.memory.gaps.length).toBeGreaterThan(0);
    expect(result.constraints.gaps.length).toBeGreaterThan(0);
  });
});

describe('scoreRepo — identity subsystem', () => {
  it('scores 0 when no AGENTS.md', () => {
    expect(scoreRepo(makeFiles()).identity.score).toBe(0);
  });

  it('scores 20 for AGENTS.md existence alone', () => {
    const result = scoreRepo(makeFiles({ agentsMd: 'short' }));
    expect(result.identity.score).toBe(20);
  });

  it('adds 20 for description with 50+ words', () => {
    const longDesc = 'word '.repeat(60);
    const result = scoreRepo(makeFiles({ agentsMd: longDesc }));
    expect(result.identity.score).toBeGreaterThanOrEqual(40);
  });

  it('adds 20 for ## Stack section', () => {
    const result = scoreRepo(makeFiles({ agentsMd: '## Stack\n- Node.js' }));
    expect(result.identity.score).toBeGreaterThanOrEqual(40);
  });

  it('adds 20 for version number in package.json', () => {
    const result = scoreRepo(
      makeFiles({ agentsMd: 'some text', packageJson: { version: '1.0.0' } }),
    );
    expect(result.identity.score).toBeGreaterThanOrEqual(40);
  });

  it('scores well with full good input', () => {
    const result = scoreRepo(makeFiles({ agentsMd: GOOD_AGENTS_MD, packageJson: { version: '1.0.0' } }));
    expect(result.identity.score).toBe(100);
  });
});

describe('scoreRepo — verification subsystem', () => {
  it('scores 0 when no AGENTS.md and no package.json', () => {
    expect(scoreRepo(makeFiles()).verification.score).toBe(0);
  });

  it('adds 30 for verification section with bash block', () => {
    const result = scoreRepo(makeFiles({ agentsMd: '```bash\nnpm run build\n```' }));
    expect(result.verification.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 20 for 2+ npm commands', () => {
    const result = scoreRepo(
      makeFiles({ agentsMd: '```bash\nnpm run build\nnpm run test\n```' }),
    );
    expect(result.verification.score).toBeGreaterThanOrEqual(50);
  });

  it('adds 30 for package.json with 2+ scripts', () => {
    const result = scoreRepo(
      makeFiles({ packageJson: { scripts: { build: 'tsc', test: 'vitest' } } }),
    );
    expect(result.verification.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 20 for having both build and test scripts', () => {
    const result = scoreRepo(
      makeFiles({ packageJson: { scripts: { build: 'tsc', test: 'vitest' } } }),
    );
    expect(result.verification.score).toBeGreaterThanOrEqual(50);
  });

  it('scores 100 with full good input', () => {
    const result = scoreRepo(
      makeFiles({
        agentsMd: GOOD_AGENTS_MD,
        packageJson: { scripts: { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint', test: 'vitest' } },
      }),
    );
    expect(result.verification.score).toBe(100);
  });
});

describe('scoreRepo — state subsystem', () => {
  it('scores 0 with no progress or handoff', () => {
    expect(scoreRepo(makeFiles()).state.score).toBe(0);
  });

  it('adds 30 for PROGRESS.md existing', () => {
    const result = scoreRepo(makeFiles({ progressMd: '# Progress' }));
    expect(result.state.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 20 for structured PROGRESS.md', () => {
    const result = scoreRepo(makeFiles({ progressMd: '## Completed\n- done\n## In progress\n- wip' }));
    expect(result.state.score).toBeGreaterThanOrEqual(50);
  });

  it('adds 30 for SESSION-HANDOFF.md existing', () => {
    const result = scoreRepo(makeFiles({ sessionHandoffMd: '## Next step' }));
    expect(result.state.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 20 for fresh PROGRESS.md (within 7 days)', () => {
    const result = scoreRepo(
      makeFiles({
        progressMd: '## Completed\n- done',
        progressMdModifiedAt: new Date(),
      }),
    );
    expect(result.state.score).toBe(70);
  });

  it('does not add freshness points for stale PROGRESS.md', () => {
    const staleDate = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000); // 10 days ago
    const result = scoreRepo(
      makeFiles({ progressMd: '## Completed\n- done', progressMdModifiedAt: staleDate }),
    );
    expect(result.state.score).toBeLessThan(70);
    expect(result.state.gaps.some((g) => g.includes('days ago'))).toBe(true);
  });
});

describe('scoreRepo — memory subsystem', () => {
  it('scores 0 with no ARCHITECTURE.md', () => {
    expect(scoreRepo(makeFiles()).memory.score).toBe(0);
  });

  it('adds 30 for ARCHITECTURE.md existing', () => {
    const result = scoreRepo(makeFiles({ architectureMd: '# Arch' }));
    expect(result.memory.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 30 for 3+ ← annotations', () => {
    const result = scoreRepo(
      makeFiles({ architectureMd: 'mod1/ ← desc\nmod2/ ← desc\nmod3/ ← desc' }),
    );
    expect(result.memory.score).toBeGreaterThanOrEqual(60);
  });

  it('scores 100 with full good architecture doc', () => {
    const result = scoreRepo(makeFiles({ architectureMd: GOOD_ARCH_MD }));
    expect(result.memory.score).toBe(100);
  });
});

describe('scoreRepo — constraints subsystem', () => {
  it('scores 0 with no constraints anywhere', () => {
    expect(scoreRepo(makeFiles()).constraints.score).toBe(0);
  });

  it('adds 30 for ## Constraints section in AGENTS.md', () => {
    const result = scoreRepo(makeFiles({ agentsMd: '## Constraints\n- some rule' }));
    expect(result.constraints.score).toBeGreaterThanOrEqual(30);
  });

  it('adds 40 for MUST language', () => {
    const result = scoreRepo(makeFiles({ agentsMd: '## Constraints\nMUST do this' }));
    expect(result.constraints.score).toBeGreaterThanOrEqual(70);
  });

  it('adds 30 for MUST NOT language', () => {
    const result = scoreRepo(makeFiles({ agentsMd: '## Constraints\nMUST NOT do this' }));
    expect(result.constraints.score).toBe(100);
  });

  it('also reads from dedicated CONSTRAINTS.md', () => {
    const result = scoreRepo(
      makeFiles({ constraintsMd: 'MUST do this. MUST NOT do that.' }),
    );
    expect(result.constraints.score).toBe(100);
  });
});

describe('scoreRepo — overall', () => {
  it('overall is the average of all 5 subsystem scores', () => {
    const result = scoreRepo(
      makeFiles({
        agentsMd: GOOD_AGENTS_MD,
        architectureMd: GOOD_ARCH_MD,
        progressMd: '## Completed\n- done\n## In progress\n- wip',
        sessionHandoffMd: '## Next step\n- continue',
        progressMdModifiedAt: new Date(),
        packageJson: {
          version: '1.0.0',
          scripts: { build: 'tsc', typecheck: 'tsc --noEmit', lint: 'eslint', test: 'vitest' },
        },
      }),
    );
    expect(result.overall).toBeGreaterThan(70);
    expect(result.overall).toBeLessThanOrEqual(100);
  });

  it('is deterministic — same input produces same output', () => {
    const files = makeFiles({ agentsMd: GOOD_AGENTS_MD });
    expect(scoreRepo(files)).toEqual(scoreRepo(files));
  });
});

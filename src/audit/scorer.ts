import type { RepoFiles } from './loader.js';

export interface SubsystemScore {
  score: number;
  gaps: string[];
}

export interface ScoredResult {
  identity: SubsystemScore;
  verification: SubsystemScore;
  state: SubsystemScore;
  memory: SubsystemScore;
  constraints: SubsystemScore;
  overall: number;
}

function scoreIdentity(files: RepoFiles): SubsystemScore {
  const gaps: string[] = [];

  if (!files.agentsMd) {
    return {
      score: 0,
      gaps: ['No AGENTS.md — agents have no entry point for this repository'],
    };
  }

  let score = 20; // AGENTS.md exists

  const wordCount = files.agentsMd.split(/\s+/).filter(Boolean).length;
  if (wordCount >= 50) {
    score += 20;
  } else {
    gaps.push(`AGENTS.md description too short (${wordCount} words, need 50+)`);
  }

  if (/^##\s+stack/im.test(files.agentsMd)) {
    score += 20;
  } else {
    gaps.push('No ## Stack section in AGENTS.md');
  }

  const hasVersion =
    (typeof files.packageJson?.['version'] === 'string') ||
    /v?\d+\.\d+\.\d+/.test(files.agentsMd);
  if (hasVersion) {
    score += 20;
  } else {
    gaps.push('No version number found in AGENTS.md or package.json');
  }

  if (/^##\s+repo\s+structure/im.test(files.agentsMd) || /src\//m.test(files.agentsMd)) {
    score += 20;
  } else {
    gaps.push('No repo structure section in AGENTS.md');
  }

  return { score, gaps };
}

function scoreVerification(files: RepoFiles): SubsystemScore {
  const gaps: string[] = [];
  let score = 0;

  const hasVerificationSection =
    files.agentsMd != null &&
    (/^##\s+verification/im.test(files.agentsMd) || /```(?:bash|sh)/.test(files.agentsMd));

  if (hasVerificationSection) {
    score += 30;
  } else {
    gaps.push('No verification commands section in AGENTS.md');
  }

  const npmCommandMatches = files.agentsMd?.match(/npm\s+(?:run\s+\w+|test|install|ci)/g) ?? [];
  if (npmCommandMatches.length >= 2) {
    score += 20;
  } else {
    gaps.push('Fewer than 2 verification commands documented in AGENTS.md');
  }

  const scripts = files.packageJson?.['scripts'];
  const scriptNames =
    scripts != null && typeof scripts === 'object' ? Object.keys(scripts) : [];

  if (scriptNames.length >= 2) {
    score += 30;
  } else {
    gaps.push('package.json missing scripts (need at least 2)');
  }

  if (scriptNames.includes('build') && scriptNames.includes('test')) {
    score += 20;
  } else {
    gaps.push('package.json missing build or test script');
  }

  return { score, gaps };
}

function scoreState(files: RepoFiles): SubsystemScore {
  const gaps: string[] = [];
  let score = 0;

  if (files.progressMd) {
    score += 30;

    if (/^##\s+(?:completed|in\s+progress|current)/im.test(files.progressMd)) {
      score += 20;
    } else {
      gaps.push('PROGRESS.md lacks structured sections (## Completed / ## In progress)');
    }
  } else {
    gaps.push('No PROGRESS.md — agents cannot resume sessions without project state');
  }

  if (files.sessionHandoffMd) {
    score += 30;
  } else {
    gaps.push('No SESSION-HANDOFF.md — agents start blind each session');
  }

  if (files.progressMdModifiedAt) {
    const ageMs = Date.now() - files.progressMdModifiedAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) {
      score += 20;
    } else {
      gaps.push(`PROGRESS.md last updated ${Math.round(ageDays)} days ago (threshold: 7)`);
    }
  }

  return { score, gaps };
}

function scoreMemory(files: RepoFiles): SubsystemScore {
  const gaps: string[] = [];

  if (!files.architectureMd) {
    return {
      score: 0,
      gaps: ['No ARCHITECTURE.md — agents cannot navigate the codebase without exploring'],
    };
  }

  let score = 30; // ARCHITECTURE.md exists

  // Lines with ← indicate module annotations
  const annotatedLines = (files.architectureMd.match(/←/g) ?? []).length;
  if (annotatedLines >= 3) {
    score += 30;
  } else {
    gaps.push('ARCHITECTURE.md has few module annotations (add ← comments to explain modules)');
  }

  if (files.architectureMd.length > 300) {
    score += 20;
  } else {
    gaps.push('ARCHITECTURE.md too short — add module responsibilities and data flow');
  }

  if (/src\//m.test(files.architectureMd)) {
    score += 20;
  } else {
    gaps.push('ARCHITECTURE.md does not reference src/ directory structure');
  }

  return { score, gaps };
}

function scoreConstraints(files: RepoFiles): SubsystemScore {
  const gaps: string[] = [];
  let score = 0;

  // Accept dedicated CONSTRAINTS.md or a ## Constraints section in AGENTS.md
  const hasSection =
    files.constraintsMd != null ||
    /^##\s+constraints/im.test(files.agentsMd ?? '');

  const constraintContent = files.constraintsMd ?? files.agentsMd ?? '';

  if (hasSection) {
    score += 30;
  } else {
    gaps.push('No CONSTRAINTS.md and no ## Constraints section in AGENTS.md');
  }

  if (/\bMUST\b/.test(constraintContent)) {
    score += 40;
  } else {
    gaps.push('No MUST language in constraints — use imperative MUST / MUST NOT');
  }

  if (/\bMUST NOT\b/.test(constraintContent)) {
    score += 30;
  } else {
    gaps.push('No MUST NOT language in constraints');
  }

  return { score, gaps };
}

export function scoreRepo(files: RepoFiles): ScoredResult {
  const identity = scoreIdentity(files);
  const verification = scoreVerification(files);
  const state = scoreState(files);
  const memory = scoreMemory(files);
  const constraints = scoreConstraints(files);

  const overall = Math.round(
    (identity.score + verification.score + state.score + memory.score + constraints.score) / 5,
  );

  return { identity, verification, state, memory, constraints, overall };
}

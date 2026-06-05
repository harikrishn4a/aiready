import type { LLMProvider } from '../utils/llm.js';
import type { RepoFiles } from './loader.js';
import type { FileMapping, Subsystem } from './mapper.js';
import { crossRef } from './cross-ref.js';
import type { CrossRefResult } from './cross-ref.js';

export interface SubsystemScore {
  score: number;
  gaps: string[];
  findings: Finding[];
  files: string[];  // relative paths of files that contributed to this subsystem
}

export interface Finding {
  type: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface ScoredResult {
  identity: SubsystemScore;
  verification: SubsystemScore;
  state: SubsystemScore;
  memory: SubsystemScore;
  constraints: SubsystemScore;
  overall: number;
  crossRef: CrossRefResult;
}

const SCORER_SYSTEM = `You are scoring whether repository files are intentional AI agent harness artifacts.

Core principle: a file must be intentionally written as a harness artifact to score well.
A workflow doc, changelog, implementation log, or generic README that happens to contain useful information does NOT qualify as a strong harness artifact.
Use the expected artifact structure from the AIReady examples: agents.md, constraints.md, architecture.md, progress.md, session-handoff.md, and structure.md.
If a subsystem's content exists inside the wrong file or as a section within a broader file, score the actual content quality. Do not score it as 0 only because the filename is non-canonical. Instead, assign partial credit and warn that it should be structured into the expected artifact.

Evaluate each subsystem independently:

IDENTITY
You are evaluating whether a file or section functions as an agent entry point for a software repository.
A genuine agent entry point MUST contain ALL of:
1. Explicit project description explaining what the project does and who it is for (minimum 40 words)
2. Tech stack section listing languages, frameworks, and versions
3. Verification commands an agent can run to confirm its work
4. Repo structure or file map showing how the codebase is organised
Score 0-100:
- All 4 present and detailed: 85-100
- 3 of 4 present: 60-80
- 2 of 4 present: 30-55
- 1 of 4 present: 10-25
- Identity details present but mixed into a generic README or planning document: 20-60
- Workflow doc, changelog, or implementation log: MAX score 20

VERIFICATION
You are evaluating whether a file or section documents how to verify work in a software repository for AI agents.
A genuine verification document MUST contain:
1. Specific runnable commands (npm test, pytest, make check, etc.)
2. Commands that match what is actually in package.json or equivalent
3. A clear indication of what "done" means for this project
Score 0-100:
- Specific commands present and complete: 70-100
- Commands present but vague or incomplete: 40-65
- Only mentions testing exists without commands: 10-35
- Runnable commands present but buried in a general agent entry, README, or plan: 35-70
- Workflow or process doc without runnable commands: MAX score 15

STATE
You are evaluating whether a file or section tracks project state for AI agents resuming work across sessions.
A genuine state file MUST contain:
1. Current build/test status (passing or failing)
2. What is completed, in progress, and blocked
3. A clear next step an agent can pick up immediately
Score 0-100:
- All 3 present and current: 75-100
- 2 of 3 present: 45-70
- Only a task list without status: 20-40
- Current state details present but embedded in a planning or implementation log: 20-60
- Implementation log or changelog: MAX score 20

MEMORY
You are evaluating whether a file or section helps AI agents navigate a codebase without exploring it manually.
A genuine memory file MUST contain:
1. Module map showing what each directory or component does
2. Clear ownership or responsibility per module
3. Key files an agent should know about
4. Data flow or dependency relationships between modules
Score 0-100:
- All 4 present: 80-100
- 3 of 4 present: 55-75
- 2 of 4 present: 30-50
- High-level description without module breakdown: 10-25
- Architecture/navigation details present but embedded in a plan or general README: 25-60
- Workflow or process doc: MAX score 20

CONSTRAINTS
You are evaluating whether a file or section documents hard limits for AI agents working in this repository.
A genuine constraints artifact MUST contain:
1. Explicit MUST or MUST NOT language
2. Specific forbidden actions (not general advice)
3. Domain-specific rules (auth, filesystem, network, etc.)
Score 0-100:
- MUST/MUST NOT language with specific rules: 70-100
- MUST/MUST NOT language is present but mixed into a general agent entry file instead of a dedicated constraints structure: 40-70
- Rules present but without MUST/MUST NOT language: 30-60
- General conventions without hard limits: 10-25
- No constraints content or no file mapped to constraints: 0
If constraints are found inside AGENTS.md, CLAUDE.md, .cursorrules, or .windsurfrules, score the actual constraint content. Do not return 0 only because the constraints are not in CONSTRAINTS.md; instead warn that the constraints are present but not properly structured.

Return ONLY valid JSON with no explanation:
{"identity":{"score":85,"findings":[{"type":"pass","message":"project purpose and stack are explicit"}]},"verification":{"score":70,"findings":[{"type":"warn","message":"commands present but done criteria are incomplete"}]},"state":{"score":60,"findings":[]},"memory":{"score":90,"findings":[]},"constraints":{"score":0,"findings":[{"type":"fail","message":"no constraints file mapped"}]}}`;

const SUBSYSTEMS: Subsystem[] = ['identity', 'verification', 'state', 'memory', 'constraints'];

interface LLMScoreEntry {
  score: number;
  findings?: Finding[];
  gaps?: string[];
}

interface LLMScoreResponse {
  identity?: LLMScoreEntry;
  verification?: LLMScoreEntry;
  state?: LLMScoreEntry;
  memory?: LLMScoreEntry;
  constraints?: LLMScoreEntry;
}

function parseScorerResponse(text: string): LLMScoreResponse {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return {};
    return JSON.parse(jsonMatch[0]) as LLMScoreResponse;
  } catch {
    return {};
  }
}

function emptyScore(): SubsystemScore {
  const message = 'No files mapped to this subsystem';
  return { score: 0, gaps: [message], findings: [{ type: 'fail', message }], files: [] };
}

function normalizeFindings(entry: LLMScoreEntry): Finding[] {
  if (Array.isArray(entry.findings)) {
    return entry.findings
      .filter((f) =>
        (f.type === 'pass' || f.type === 'warn' || f.type === 'fail') &&
        typeof f.message === 'string',
      )
      .map((f) => ({ type: f.type, message: f.message }));
  }

  if (Array.isArray(entry.gaps)) {
    return entry.gaps
      .filter((g) => typeof g === 'string')
      .map((message) => ({ type: 'fail' as const, message }));
  }

  return [];
}

function buildSubsystemContent(
  subsystem: Subsystem,
  mdFiles: RepoFiles['mdFiles'],
  mappings: FileMapping[],
): { files: string[]; content: string } {
  const mappedPaths = mappings
    .filter((m) => m.subsystems.includes(subsystem))
    .map((m) => m.path);

  if (mappedPaths.length === 0) return { files: [], content: '' };

  const fileMap = new Map(mdFiles.map((f) => [f.path, f.fullContent]));
  const sections = mappedPaths.map((p) => {
    const content = fileMap.get(p) ?? '';
    return `=== ${p} ===\n${content}`;
  });

  return { files: mappedPaths, content: sections.join('\n\n') };
}

export async function scoreRepo(
  files: RepoFiles,
  mappings: FileMapping[],
  provider: LLMProvider,
): Promise<ScoredResult> {
  // Build per-subsystem content for the scoring prompt
  const subsystemContents = SUBSYSTEMS.map((s) => ({
    subsystem: s,
    ...buildSubsystemContent(s, files.mdFiles, mappings),
  }));

  const contentSections = subsystemContents
    .map(({ subsystem, content }) => {
      if (!content) return `### ${subsystem}\n(no files mapped)`;
      return `### ${subsystem}\n${content}`;
    })
    .join('\n\n');

  const text = await provider.chat(
    SCORER_SYSTEM,
    `Score this repository's AI harness across all 5 subsystems:\n\n${contentSections}`,
    { fast: false },
  );

  const llmScores = parseScorerResponse(text);

  function toSubsystemScore(key: Subsystem): SubsystemScore {
    const entry = llmScores[key];
    const { files: subsysFiles } = subsystemContents.find((s) => s.subsystem === key) ?? { files: [] };
    if (!entry) return emptyScore();
    const findings = normalizeFindings(entry);
    const gaps = findings
      .filter((f) => f.type === 'warn' || f.type === 'fail')
      .map((f) => f.message);
    return {
      score: Math.min(100, Math.max(0, Math.round(entry.score))),
      gaps,
      findings,
      files: subsysFiles,
    };
  }

  const identity = toSubsystemScore('identity');
  const verification = toSubsystemScore('verification');
  const state = toSubsystemScore('state');
  const memory = toSubsystemScore('memory');
  const constraints = toSubsystemScore('constraints');

  const overall = Math.round(
    (identity.score + verification.score + state.score + memory.score + constraints.score) / 5,
  );

  const xref = crossRef(files, mappings);

  return { identity, verification, state, memory, constraints, overall, crossRef: xref };
}

import { join } from 'path';
import type { LLMProvider } from '../utils/llm.js';
import { resolveExamplesDir } from '../utils/examples-dir.js';
import { exists, readFile as readFsFile } from '../utils/fs.js';
import type { RepoFiles } from './loader.js';
import type { FileMapping, Subsystem } from './mapper.js';
import { crossRef } from './cross-ref.js';
import type { CrossRefResult } from './cross-ref.js';
import { loadTemplates } from './templates.js';
import type { LoadedTemplates } from './templates.js';

export interface SubsystemScore {
  score: number;
  gaps: string[];
  findings: Finding[];
  files: string[];
  baselineStatus?: 'established' | 'partial' | 'missing';
}

export interface Finding {
  type: 'pass' | 'warn' | 'fail';
  message: string;
}

export interface BaselineCheck {
  status: 'established' | 'partial' | 'missing';
  runnableCommand: string | null;
  commandExists: boolean;
  documented: boolean;
  crossRefsValid: boolean;
  findings: Finding[];
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

const SUBSYSTEMS: Subsystem[] = ['identity', 'verification', 'state', 'memory', 'constraints'];

// The single intent-based scoring question per subsystem. Scoring is 100%
// about whether an agent can do its job using only what is documented —
// not about file names, heading names, or structural conventions.
const SUBSYSTEM_INTENTS: Record<Subsystem, string> = {
  identity: `Agent knows what the project is, what problem it solves, the tech
    stack with versions, and where key files live — it can orient itself in
    under 60 seconds.`,

  verification: `Agent has a single runnable command to confirm its work is
    correct, knows what passing looks like, and can find that command without
    exploring the repo.`,

  state: `Agent can resume a session without asking questions. Knows what is
    done, what is in progress, what is blocked, and what the next task is. No
    blind spots.`,

  memory: `Agent can navigate the codebase without exploring it manually. Knows
    the module map, what each module does, key files, and how data flows
    through the system.`,

  constraints: `Agent knows what it must never do in this repository. Hard
    limits are explicit, specific, and use MUST/MUST NOT language.`,
};

function buildScoringSystemPrompt(templates: LoadedTemplates): string {
  const templateContext = SUBSYSTEMS
    .map((subsystem) => {
      const content = (templates.primary[subsystem] ?? '').slice(0, 800);
      return `${subsystem.toUpperCase()} reference:\n${content}`;
    })
    .join('\n\n---\n\n');

  return `You are scoring an AI agent harness repository.

For each of the 5 subsystems, answer ONE question:
"Can an AI coding agent do its job using only what is documented here?"

SUBSYSTEM INTENTS:
${SUBSYSTEMS.map((k) => `${k}: ${SUBSYSTEM_INTENTS[k]}`).join('\n\n')}

SCORING RULES:
- Score 0-100 based purely on content usefulness to an agent
- Ignore file names, heading names, and structural conventions
- A Makefile, shell script, markdown file, or JSON file can all satisfy a
  subsystem equally well if the content is right
- Partial credit when content exists but is incomplete or hard to find
- A workflow doc or changelog scores max 20 — these are not harness artifacts
- For each subsystem, return specific gaps an agent would notice

SCORE BANDS — anchor every score to these definitions (do not score between bands arbitrarily):
- 90-100: an agent can fully do its job from this alone — specific, complete, immediately actionable
- 70-89:  mostly sufficient — minor gaps an agent could work around
- 40-69:  partial — key facts present but the agent would still need to explore or ask
- 20-39:  sparse — mostly placeholders, generic text, or "Not yet documented"
- 0-19:   absent or useless
Apply the bands consistently: identical content must always receive the same score.

TEMPLATE REFERENCE (quality examples — headings are suggestions not requirements):
${templateContext}

Return ONLY valid JSON:
{
  "identity":     { "score": 0-100, "gaps": ["specific gap..."], "findings": [{"type":"pass"|"warn"|"fail","message":"..."}] },
  "verification": { "score": 0-100, "gaps": [], "findings": [] },
  "state":        { "score": 0-100, "gaps": [], "findings": [] },
  "memory":       { "score": 0-100, "gaps": [], "findings": [] },
  "constraints":  { "score": 0-100, "gaps": [], "findings": [] }
}`;
}

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

function normalizeFindings(entry: LLMScoreEntry): Finding[] {
  if (Array.isArray(entry.findings)) {
    return entry.findings
      .filter((f) => (f.type === 'pass' || f.type === 'warn' || f.type === 'fail') && typeof f.message === 'string')
      .map((f) => ({ type: f.type, message: f.message }));
  }
  if (Array.isArray(entry.gaps)) {
    return entry.gaps
      .filter((g) => typeof g === 'string')
      .map((message) => ({ type: 'fail' as const, message }));
  }
  return [];
}

// Per-file content budget. Capping per file (not the joined blob) guarantees a
// dedicated artifact (e.g. docs/CONSTRAINTS.md) is always shown to the scorer even
// when a large AGENTS.md is also mapped to the same subsystem.
const PER_FILE_CONTENT_CAP = 6000;

// Agent entry files reference everything, so they get mapped broadly. Show the
// subsystem's dedicated files first so entry-file references never crowd them out.
const ENTRY_FILE_BASENAMES = new Set([
  'agents.md', 'claude.md', 'agent.md', 'copilot-instructions.md',
  '.cursorrules', '.windsurfrules',
]);

function isEntryFile(path: string): boolean {
  return ENTRY_FILE_BASENAMES.has((path.split('/').pop() ?? path).toLowerCase());
}

function buildSubsystemContent(
  subsystem: Subsystem,
  mdFiles: RepoFiles['mdFiles'],
  mappings: FileMapping[],
): { files: string[]; content: string } {
  const mappedPaths = mappings.filter((m) => m.subsystems.includes(subsystem)).map((m) => m.path);
  if (mappedPaths.length === 0) return { files: [], content: '' };

  // Dedicated artifacts first, entry files (AGENTS.md etc.) last.
  const ordered = [...mappedPaths].sort((a, b) => Number(isEntryFile(a)) - Number(isEntryFile(b)));

  const fileMap = new Map(mdFiles.map((f) => [f.path, f.fullContent]));
  const sections = ordered.map((p) => {
    const content = (fileMap.get(p) ?? '').slice(0, PER_FILE_CONTENT_CAP);
    return `=== ${p} ===\n${content}`;
  });
  return { files: ordered, content: sections.join('\n\n') };
}

// Verification baseline — surfaced to the user as a finding only. It is NOT a
// score input: scoring is 100% intent-based via the LLM.
export async function checkVerificationBaseline(
  targetDir: string,
  agentsMdContent: string | null,
  packageJsonScripts: Record<string, unknown> | null,
): Promise<BaselineCheck> {
  const findings: Finding[] = [];

  const makefilePath = join(targetDir, 'Makefile');
  const makefileExists = exists(makefilePath);
  let makefileTargets: string[] = [];
  if (makefileExists) {
    const content = readFsFile(makefilePath);
    if (content) {
      makefileTargets = (content.match(/^[a-zA-Z][a-zA-Z0-9_-]*:/gm) ?? [])
        .map((t) => t.replace(':', '').trim());
    }
  }

  const verifyShExists = exists(join(targetDir, 'scripts/verify.sh'));

  let runnableCommand: string | null = null;
  if (makefileExists && makefileTargets.includes('check')) {
    runnableCommand = 'make check';
  } else if (makefileExists && makefileTargets.includes('verify')) {
    runnableCommand = 'make verify';
  } else if (makefileExists && makefileTargets.includes('test')) {
    runnableCommand = 'make test';
  } else if (verifyShExists) {
    runnableCommand = './scripts/verify.sh';
  } else if (packageJsonScripts && 'test' in packageJsonScripts) {
    runnableCommand = 'npm test';
  }

  const commandExists = runnableCommand !== null;

  const agentsLower = agentsMdContent?.toLowerCase() ?? '';
  const documented = commandExists && (
    agentsLower.includes('make check') ||
    agentsLower.includes('make verify') ||
    agentsLower.includes('make test') ||
    agentsLower.includes('verify.sh') ||
    agentsLower.includes('npm test') ||
    /verification\s+commands/i.test(agentsLower)
  );

  const crossRefsValid = agentsMdContent !== null && (
    agentsMdContent.includes('Makefile') ||
    agentsMdContent.includes('verify.sh') ||
    /\bmake\s+\w/i.test(agentsMdContent) ||
    /verification\s+commands/i.test(agentsMdContent)
  );

  if (commandExists) {
    findings.push({ type: 'pass', message: `Runnable verification command: ${runnableCommand}` });
  } else {
    findings.push({ type: 'fail', message: 'No runnable verification command (no Makefile with check/verify/test target, no scripts/verify.sh, no npm test)' });
  }

  if (documented) {
    findings.push({ type: 'pass', message: 'Verification commands documented in agent entry file' });
  } else {
    findings.push({ type: commandExists ? 'warn' : 'fail', message: 'Verification commands not documented in AGENTS.md — agents cannot confirm their work' });
  }

  if (crossRefsValid) {
    findings.push({ type: 'pass', message: 'Agent entry file cross-references verification artifacts' });
  } else {
    findings.push({ type: 'warn', message: 'Agent entry file does not reference Makefile or verify.sh' });
  }

  let status: BaselineCheck['status'];
  if (commandExists && documented && crossRefsValid) {
    status = 'established';
  } else if (commandExists) {
    status = 'partial';
  } else {
    status = 'missing';
  }

  return { status, runnableCommand, commandExists, documented, crossRefsValid, findings };
}

export async function scoreRepo(
  files: RepoFiles,
  mappings: FileMapping[],
  provider: LLMProvider,
  examplesDir?: string,
): Promise<ScoredResult> {
  // Templates loaded only to give the LLM quality reference content —
  // never used for structural checks.
  const templates = await loadTemplates(examplesDir ?? resolveExamplesDir());

  const subsystemContents = SUBSYSTEMS.map((s) => ({
    subsystem: s,
    ...buildSubsystemContent(s, files.mdFiles, mappings),
  }));

  const contentSections = subsystemContents
    .map(({ subsystem, content }) => {
      if (!content) return `### ${subsystem}\n(no files mapped to this subsystem)`;
      // Per-file capping already bounds each file; allow several files per subsystem.
      return `### ${subsystem}\n${content.slice(0, 16000)}`;
    })
    .join('\n\n');

  // Single LLM call scores all 5 subsystems intent-based.
  // temperature:0 + fixed seed keep repeated audits of identical content stable.
  const text = await provider.chat(
    buildScoringSystemPrompt(templates),
    `Score this repository's AI harness:\n\n${contentSections}`,
    { fast: false, temperature: 0, seed: 7 },
  );

  const llmScores = parseScorerResponse(text);

  // Verification baseline as finding only — not a score input.
  const packageJsonScripts = (files.packageJson?.scripts ?? null) as Record<string, unknown> | null;
  const baseline = await checkVerificationBaseline(files.targetDir, files.agentsMd, packageJsonScripts);

  function toSubsystemScore(key: Subsystem): SubsystemScore {
    const { files: subsysFiles } = subsystemContents.find((s) => s.subsystem === key) ?? { files: [] };

    if (subsysFiles.length === 0 && key !== 'verification') {
      const message = 'No file found serving this subsystem';
      return {
        score: 0,
        gaps: [message],
        findings: [{ type: 'fail', message }],
        files: [],
      };
    }

    const entry = llmScores[key];
    if (!entry) {
      const message = 'LLM did not score this subsystem';
      return {
        score: 0,
        gaps: [message],
        findings: key === 'verification'
          ? [{ type: 'fail', message }, ...baseline.findings]
          : [{ type: 'fail', message }],
        files: subsysFiles,
        baselineStatus: key === 'verification' ? baseline.status : undefined,
      };
    }

    // For verification, merge baseline findings into the LLM findings.
    const findings = key === 'verification'
      ? [...normalizeFindings(entry), ...baseline.findings]
      : normalizeFindings(entry);

    return {
      score: Math.min(100, Math.max(0, Math.round(entry.score))),
      gaps: entry.gaps ?? [],
      findings,
      files: subsysFiles,
      baselineStatus: key === 'verification' ? baseline.status : undefined,
    };
  }

  const identity     = toSubsystemScore('identity');
  const verification = toSubsystemScore('verification');
  const state        = toSubsystemScore('state');
  const memory       = toSubsystemScore('memory');
  const constraints  = toSubsystemScore('constraints');

  const overall = Math.round(
    (identity.score + verification.score + state.score + memory.score + constraints.score) / 5,
  );

  const xref = crossRef(files, mappings);

  return { identity, verification, state, memory, constraints, overall, crossRef: xref };
}

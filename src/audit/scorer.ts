import type { LLMProvider } from '../utils/llm.js';
import type { RepoFiles } from './loader.js';
import type { FileMapping, Subsystem } from './mapper.js';
import { crossRef } from './cross-ref.js';
import type { CrossRefResult } from './cross-ref.js';

export interface SubsystemScore {
  score: number;
  gaps: string[];
  files: string[];  // relative paths of files that contributed to this subsystem
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

const SCORER_SYSTEM = `You are scoring an AI agent harness for a software repository.

Score each of the 5 subsystems from 0 to 100 based on the file contents provided.

Scoring criteria:
- identity (0-100): Does an agent know what this project is? (purpose, stack, version, structure)
  Score 0 if no relevant files. Score 30-60 for partial coverage. Score 70-90 for good coverage. Score 91-100 for comprehensive coverage including stack, version, and structure.
- verification (0-100): Can an agent confirm work is correct? (build/test commands documented and present)
  Score 0 if no verification commands. Score 50-70 if commands mentioned. Score 80-100 if commands are specific, runnable, and cross-referenced with scripts.
- state (0-100): Can an agent resume sessions? (progress tracking, session handoffs)
  Score 0 if no state files. Score 30-50 for minimal tracking. Score 60-80 for structured progress + handoff. Score 90-100 for structured, fresh, and complete state.
- memory (0-100): Can an agent navigate without exploring? (architecture doc, module map with annotations)
  Score 0 if no architecture doc. Score 30-50 for basic architecture. Score 70-90 for annotated module map. Score 91-100 for detailed map with ← annotations and data flow.
- constraints (0-100): Does an agent know what it must never do? (MUST/MUST NOT rules)
  Score 0 if no constraints. Score 30-50 for general rules. Score 70-90 for MUST language. Score 91-100 for explicit MUST NOT rules covering critical failure modes.

Return ONLY valid JSON with no explanation:
{"identity":{"score":85,"gaps":["one specific gap"]},"verification":{"score":70,"gaps":[]},"state":{"score":60,"gaps":["gap"]},"memory":{"score":90,"gaps":[]},"constraints":{"score":100,"gaps":[]}}`;

const SUBSYSTEMS: Subsystem[] = ['identity', 'verification', 'state', 'memory', 'constraints'];

interface LLMScoreEntry {
  score: number;
  gaps: string[];
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
  return { score: 0, gaps: ['No files mapped to this subsystem'], files: [] };
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
    return {
      score: Math.min(100, Math.max(0, Math.round(entry.score))),
      gaps: Array.isArray(entry.gaps) ? entry.gaps.filter((g) => typeof g === 'string') : [],
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

  const xref = crossRef(files);

  return { identity, verification, state, memory, constraints, overall, crossRef: xref };
}

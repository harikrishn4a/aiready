import type { RepoFiles } from './loader.js';
import type { FileMapping } from './mapper.js';

export interface CrossRefCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface CrossRefResult {
  checks: CrossRefCheck[];
}

function extractNpmRunCommands(content: string): string[] {
  const commands: string[] = [];
  const bashBlockRegex = /```(?:bash|sh|shell)\n([\s\S]*?)```/g;
  let match;
  while ((match = bashBlockRegex.exec(content)) !== null) {
    const block = match[1] ?? '';
    const runMatches = block.match(/npm\s+run\s+(\w[\w-]*)/g) ?? [];
    for (const cmd of runMatches) {
      const name = cmd.replace(/^npm\s+run\s+/, '');
      commands.push(name);
    }
  }
  return [...new Set(commands)];
}

function extractDocumentedModules(content: string): string[] {
  // Lines like "  audit/        ← Stage 1..." inside code blocks
  const moduleRegex = /^\s{2,}(\w[\w-]*)\/\s.*←/gm;
  const modules: string[] = [];
  let match;
  while ((match = moduleRegex.exec(content)) !== null) {
    modules.push(match[1] as string);
  }
  return [...new Set(modules)];
}

function checkCommands(
  files: RepoFiles,
  mappings: FileMapping[],
  mdFileMap: Map<string, string>,
): CrossRefCheck[] {
  // Prefer the canonical agent entry file; fall back to identity/verification mapped files
  let contentToCheck: string | null = files.agentsMd;

  if (!contentToCheck && mappings.length > 0) {
    const mapped = mappings
      .filter((m) => m.subsystems.includes('identity') || m.subsystems.includes('verification'))
      .map((m) => mdFileMap.get(m.path))
      .filter((c): c is string => c !== undefined)
      .join('\n\n');
    if (mapped) contentToCheck = mapped;
  }

  if (!contentToCheck) {
    return [
      {
        name: 'commands-in-agents-exist-in-package',
        passed: false,
        detail: 'No agent harness file found to extract commands from',
      },
    ];
  }

  const commands = extractNpmRunCommands(contentToCheck);
  if (commands.length === 0) {
    return [
      {
        name: 'commands-in-agents-exist-in-package',
        passed: true,
        detail: 'No npm run commands found in harness bash blocks',
      },
    ];
  }

  const scripts = files.packageJson?.['scripts'];
  const scriptNames: string[] =
    scripts != null && typeof scripts === 'object' ? Object.keys(scripts) : [];

  const missing = commands.filter((cmd) => !scriptNames.includes(cmd));

  if (missing.length === 0) {
    return [
      {
        name: 'commands-in-agents-exist-in-package',
        passed: true,
        detail: `All ${commands.length} npm run command(s) in harness found in package.json scripts`,
      },
    ];
  }

  return missing.map((cmd) => ({
    name: 'commands-in-agents-exist-in-package',
    passed: false,
    detail: `\`npm run ${cmd}\` in harness not found in package.json scripts`,
  }));
}

function checkModules(
  files: RepoFiles,
  mappings: FileMapping[],
  mdFileMap: Map<string, string>,
): CrossRefCheck {
  // Prefer canonical architecture file; fall back to memory-mapped files
  let contentToCheck: string | null = files.architectureMd;

  if (!contentToCheck && mappings.length > 0) {
    const mapped = mappings
      .filter((m) => m.subsystems.includes('memory'))
      .map((m) => mdFileMap.get(m.path))
      .filter((c): c is string => c !== undefined)
      .join('\n\n');
    if (mapped) contentToCheck = mapped;
  }

  if (!contentToCheck) {
    return {
      name: 'architecture-modules-match-src',
      passed: false,
      detail: 'No architecture file found to extract documented modules from',
    };
  }

  const documented = extractDocumentedModules(contentToCheck);
  if (documented.length === 0) {
    return {
      name: 'architecture-modules-match-src',
      passed: true,
      detail: 'No annotated module directories found in architecture file',
    };
  }

  const missing = documented.filter((mod) => !files.srcDirs.includes(mod));
  if (missing.length === 0) {
    return {
      name: 'architecture-modules-match-src',
      passed: true,
      detail: `All ${documented.length} documented module(s) found in src/`,
    };
  }

  return {
    name: 'architecture-modules-match-src',
    passed: false,
    detail: `Module(s) in architecture file not found in src/: ${missing.join(', ')}`,
  };
}

function checkProgressFreshness(files: RepoFiles): CrossRefCheck {
  if (!files.progressMdModifiedAt) {
    return {
      name: 'progress-md-is-fresh',
      passed: false,
      detail: 'No PROGRESS.md found',
    };
  }

  const ageDays =
    (Date.now() - files.progressMdModifiedAt.getTime()) / (1000 * 60 * 60 * 24);

  if (ageDays <= 7) {
    return {
      name: 'progress-md-is-fresh',
      passed: true,
      detail: `PROGRESS.md updated ${Math.round(ageDays)} day(s) ago`,
    };
  }

  return {
    name: 'progress-md-is-fresh',
    passed: false,
    detail: `PROGRESS.md last updated ${Math.round(ageDays)} days ago (threshold: 7)`,
  };
}

export function crossRef(files: RepoFiles, mappings: FileMapping[] = []): CrossRefResult {
  const mdFileMap = new Map(files.mdFiles.map((f) => [f.path, f.fullContent]));
  return {
    checks: [
      ...checkCommands(files, mappings, mdFileMap),
      checkModules(files, mappings, mdFileMap),
      checkProgressFreshness(files),
    ],
  };
}

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface UpdateCache {
  checkedAt: number;
  latest?: string;
}

function cacheFilePath(): string {
  const dir = join(homedir(), '.cache', 'aiready');
  mkdirSync(dir, { recursive: true });
  return join(dir, 'update-check.json');
}

function parseVersion(version: string): number[] {
  return version.replace(/^v/, '').split('.').map((part) => Number.parseInt(part, 10));
}

function isNewer(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);

  for (let i = 0; i < length; i++) {
    const diff = (latestParts[i] ?? 0) - (currentParts[i] ?? 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}

function readCache(): UpdateCache | null {
  const cachePath = cacheFilePath();
  if (!existsSync(cachePath)) return null;

  try {
    return JSON.parse(readFileSync(cachePath, 'utf8')) as UpdateCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  writeFileSync(cacheFilePath(), JSON.stringify(cache));
}

function printUpdateNotice(latest: string, current: string, packageName: string): void {
  process.stderr.write(
    `\nUpdate available: ${current} → ${latest}\n` +
      `Run: npm install -g ${packageName}@latest\n\n`,
  );
}

export async function checkForUpdate(packageName: string, currentVersion: string): Promise<void> {
  if (process.env['CI'] || process.env['AIREADY_NO_UPDATE_CHECK'] === '1') return;

  const cached = readCache();
  if (cached && Date.now() - cached.checkedAt < CACHE_TTL_MS) {
    if (cached.latest && isNewer(cached.latest, currentVersion)) {
      printUpdateNotice(cached.latest, currentVersion, packageName);
    }
    return;
  }

  try {
    const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return;

    const body = (await response.json()) as { version?: string };
    if (!body.version) return;

    writeCache({ checkedAt: Date.now(), latest: body.version });
    if (isNewer(body.version, currentVersion)) {
      printUpdateNotice(body.version, currentVersion, packageName);
    }
  } catch {
    // Ignore network failures — update checks must never block the CLI.
  }
}

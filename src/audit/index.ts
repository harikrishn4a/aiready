import { resolve } from 'path';
import { loadRepo } from './loader.js';
import { scoreRepo } from './scorer.js';
import { crossRef } from './cross-ref.js';
import { report } from './reporter.js';

export interface AuditOptions {
  json: boolean;
  minScore: number;
}

export function runAudit(target: string, opts: AuditOptions): void {
  const targetDir = resolve(target);
  const files = loadRepo(targetDir);
  const scored = scoreRepo(files);
  const xref = crossRef(files);
  report(scored, xref, { json: opts.json });

  if (scored.overall < opts.minScore) {
    process.exit(1);
  }
}

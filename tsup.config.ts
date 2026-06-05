import { defineConfig } from 'tsup';
import { cpSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function copyExamplesToDist(): void {
  const src = join(process.cwd(), 'examples');
  const dest = join(process.cwd(), 'dist', 'examples');
  if (!existsSync(src)) return;

  mkdirSync(dest, { recursive: true });

  function copyDir(from: string, to: string): void {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) {
      if (entry === '.env') continue;
      const srcPath = join(from, entry);
      const destPath = join(to, entry);
      if (statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        cpSync(srcPath, destPath);
      }
    }
  }

  copyDir(src, dest);
}

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  dts: true,
  clean: true,
  target: 'node20',
  banner: {
    js: '#!/usr/bin/env node',
  },
  onSuccess: async () => {
    copyExamplesToDist();
  },
});

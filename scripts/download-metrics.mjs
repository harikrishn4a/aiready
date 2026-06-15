#!/usr/bin/env node

/**
 * Offline download metrics for @sicilianwildcat/aiready.
 * Not loaded by the CLI — run locally or on a cron schedule.
 *
 * Usage:
 *   npm run metrics:downloads
 *   node scripts/download-metrics.mjs --range last-week
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import npmStatsApi from 'npm-stats-api';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(
  readFileSync(join(__dirname, '..', 'package.json'), 'utf8'),
);
const packageName = pkg.name;

const stat = npmStatsApi.stat ?? npmStatsApi.npm?.stat;
if (typeof stat !== 'function') {
  process.stderr.write(
    'ERROR: npm-stats-api stat() export not found\n' +
      'WHY: The download metrics script cannot query the npm registry\n' +
      'FIX: Reinstall npm-stats-api or pin a compatible version\n',
  );
  process.exit(1);
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function periodToRange(period) {
  const end = addDays(new Date(), -1);
  switch (period) {
    case 'last-day':
      return { start: formatDate(end), end: formatDate(end), label: 'Last day' };
    case 'last-week':
      return {
        start: formatDate(addDays(end, -6)),
        end: formatDate(end),
        label: 'Last 7 days',
      };
    case 'last-month':
      return {
        start: formatDate(addDays(end, -29)),
        end: formatDate(end),
        label: 'Last 30 days',
      };
    default:
      return null;
  }
}

function parseArgs(argv) {
  const rangeIdx = argv.indexOf('--range');
  const range =
    rangeIdx >= 0 && argv[rangeIdx + 1] ? argv[rangeIdx + 1] : 'summary';
  return { range };
}

async function fetchDownloads(start, end) {
  const encoded = encodeURIComponent(packageName);
  const res = await stat(encoded, start, end);
  return res.body;
}

async function printSummary() {
  const periods = ['last-day', 'last-week', 'last-month'];
  const rows = [];

  for (const period of periods) {
    const range = periodToRange(period);
    if (!range) continue;
    const body = await fetchDownloads(range.start, range.end);
    rows.push({
      period: range.label,
      downloads: body.downloads,
      start: body.start,
      end: body.end,
    });
  }

  process.stdout.write(`Download metrics for ${packageName}\n\n`);
  for (const row of rows) {
    process.stdout.write(
      `${row.period.padEnd(14)} ${String(row.downloads).padStart(8)}  (${row.start} → ${row.end})\n`,
    );
  }
  process.stdout.write('\n');
}

async function printRange(period) {
  const range = periodToRange(period);
  if (!range) {
    process.stderr.write(
      `ERROR: Unknown period "${period}"\n` +
        'WHY: npm download metrics only support last-day, last-week, and last-month\n' +
        'FIX: Pass --range last-day | last-week | last-month\n',
    );
    process.exit(1);
  }

  const encoded = encodeURIComponent(packageName);
  const url = `https://api.npmjs.org/downloads/range/${range.start}:${range.end}/${encoded}`;
  const response = await fetch(url);
  if (!response.ok) {
    process.stderr.write(
      `ERROR: npm registry returned ${response.status} for ${url}\n` +
        'WHY: Download range data could not be fetched\n' +
        'FIX: Retry later or verify the package name on npm\n',
    );
    process.exit(1);
  }

  const data = await response.json();
  process.stdout.write(
    `Daily downloads for ${packageName} (${range.label})\n\n`,
  );
  for (const day of data.downloads ?? []) {
    process.stdout.write(`${day.day}  ${String(day.downloads).padStart(6)}\n`);
  }
  process.stdout.write(`\nTotal: ${data.downloads?.reduce((sum, d) => sum + d.downloads, 0) ?? 0}\n`);
}

async function main() {
  const { range } = parseArgs(process.argv.slice(2));
  if (range === 'summary') {
    await printSummary();
    return;
  }
  await printRange(range);
}

main().catch((err) => {
  process.stderr.write(
    `ERROR: ${err instanceof Error ? err.message : String(err)}\n` +
      'WHY: Failed to fetch npm download metrics\n' +
      'FIX: Check network access and npm registry status\n',
  );
  process.exit(1);
});

import { extractSectionHeadings } from '../audit/templates.js';
import type { LLMProvider } from '../utils/llm.js';

export interface CorrectionResult {
  content: string;
  corrections: string[];
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function bigramList(str: string): string[] {
  const bigrams: string[] = [];
  for (let i = 0; i < str.length - 1; i++) {
    bigrams.push(str.slice(i, i + 2));
  }
  return bigrams;
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aBigrams = bigramList(a);
  const bBigrams = bigramList(b);
  let matches = 0;
  const bCopy = [...bBigrams];
  for (const bigram of aBigrams) {
    const idx = bCopy.indexOf(bigram);
    if (idx >= 0) {
      matches++;
      bCopy.splice(idx, 1);
    }
  }
  return (2 * matches) / (aBigrams.length + bBigrams.length);
}

export function findDriftedHeadings(
  content: string,
  templateContent: string,
): { drifted: string[]; canonical: string[] } {
  const templateHeadings = extractSectionHeadings(templateContent);
  const contentHeadings = extractSectionHeadings(content);
  const drifted: string[] = [];
  const canonical: string[] = [];

  for (const templateHeading of templateHeadings) {
    if (contentHeadings.includes(templateHeading)) continue;
    const similar = contentHeadings.find(
      (h) => similarity(h.toLowerCase(), templateHeading.toLowerCase()) > 0.6,
    );
    if (similar) {
      drifted.push(similar);
      canonical.push(templateHeading);
    }
  }

  return { drifted, canonical };
}

export function replaceHeadings(
  content: string,
  drifted: string[],
  canonical: string[],
): string {
  let fixed = content;
  for (let i = 0; i < drifted.length; i++) {
    fixed = fixed.replace(
      new RegExp(`^## ${escapeRegex(drifted[i])}$`, 'm'),
      `## ${canonical[i]}`,
    );
  }
  return fixed;
}

function extractSectionsContent(templateContent: string, headings: string[]): string {
  const lines = templateContent.split('\n');
  const result: string[] = [];
  let inTarget = false;
  let currentHeading = '';
  let sectionLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (inTarget && sectionLines.length > 0) {
        result.push(`## ${currentHeading}`);
        result.push(...sectionLines);
      }
      currentHeading = line.replace(/^## /, '').trim();
      inTarget = headings.includes(currentHeading);
      sectionLines = [];
    } else if (inTarget) {
      sectionLines.push(line);
    }
  }

  if (inTarget && sectionLines.length > 0) {
    result.push(`## ${currentHeading}`);
    result.push(...sectionLines);
  }

  return result.join('\n');
}

export async function correctHeadings(
  generatedContent: string,
  templateContent: string,
  _filename: string,
  provider: LLMProvider,
): Promise<CorrectionResult> {
  const { drifted, canonical } = findDriftedHeadings(generatedContent, templateContent);
  const corrections: string[] = [];

  let fixed = generatedContent;
  if (drifted.length > 0) {
    fixed = replaceHeadings(fixed, drifted, canonical);
    for (let i = 0; i < drifted.length; i++) {
      corrections.push(`${drifted[i]} → ${canonical[i]}`);
    }
  }

  const templateHeadings = extractSectionHeadings(templateContent);
  const stillMissing = templateHeadings.filter(
    (h) => !extractSectionHeadings(fixed).includes(h),
  );

  if (stillMissing.length > 0) {
    const sectionsTemplate = extractSectionsContent(templateContent, stillMissing);
    const corrected = await provider.chat(
      `You are fixing a harness artifact that is missing required sections.\n` +
      `Add ONLY the missing sections listed below.\n` +
      `Do not change any existing content.\n` +
      `Use EXACTLY these heading names — do not paraphrase.`,
      `File content:\n${fixed}\n\n` +
      `Missing sections to add (use these exact headings):\n` +
      `${stillMissing.map((h) => `## ${h}`).join('\n')}\n\n` +
      `Template for missing sections:\n${sectionsTemplate}\n\n` +
      `Output the complete updated file with missing sections added.`,
      { fast: false },
    );
    fixed = corrected;
    for (const h of stillMissing) {
      corrections.push(`added missing: ${h}`);
    }
  }

  return { content: fixed, corrections };
}

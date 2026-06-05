/** Strip markdown code fences from LLM output before writing to disk. */
export function cleanLLMOutput(content: string): string {
  let out = content.trim();
  const fenceMatch = out.match(/^```(?:\w+)?\s*\n([\s\S]*?)\n```\s*$/);
  if (fenceMatch) {
    out = fenceMatch[1].trimEnd();
  }
  return out;
}

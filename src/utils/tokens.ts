// 1 token ≈ 4 characters — accurate within 15%, enough for logging
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

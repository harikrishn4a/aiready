const FRAMES = ['·', '✻', '✽', '✶', '✳', '✢'] as const;
const SEA_GREEN = '\x1b[38;2;46;139;87m';
const RESET = '\x1b[0m';
const CLEAR_LINE = '\x1b[K';

export function shouldUseSpinner(enabled: boolean): boolean {
  return enabled && process.stdout.isTTY === true && process.env['CI'] !== 'true';
}

export async function withSpinner<T>(
  message: string,
  enabled: boolean,
  work: () => Promise<T>,
): Promise<T> {
  if (!shouldUseSpinner(enabled)) {
    return work();
  }

  let frameIndex = 0;
  const timer = setInterval(() => {
    const glyph = FRAMES[frameIndex] ?? FRAMES[0];
    process.stdout.write(`\r${CLEAR_LINE}${SEA_GREEN}${glyph}${RESET} ${message}`);
    frameIndex = (frameIndex + 1) % FRAMES.length;
  }, 120);

  try {
    const result = await work();
    process.stdout.write(`\r${CLEAR_LINE}${SEA_GREEN}✔${RESET} ${message}\n`);
    return result;
  } catch (err) {
    process.stdout.write(`\r${CLEAR_LINE}`);
    throw err;
  } finally {
    clearInterval(timer);
  }
}

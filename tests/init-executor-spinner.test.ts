import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { LLMProvider } from '../src/utils/llm';
import type { ArtifactPlan } from '../src/init/planner';

vi.mock('ora');

import ora from 'ora';
import { executeGenerate, executeImprove } from '../src/init/executor';

// Non-generateOnly artifact so spinner is triggered
const MOCK_ITEM: ArtifactPlan = {
  filename: 'CONSTRAINTS.md',
  action: 'generate',
  subsystem: 'constraints',
  templateFile: 'examples/constraints.md',
  sourceFiles: [],
  currentScore: null,
  reason: 'file does not exist',
  alwaysGenerate: false,
  generateOnly: false,
};

const MOCK_IMPROVE_ITEM: ArtifactPlan = {
  filename: 'CONSTRAINTS.md',
  action: 'improve',
  subsystem: 'constraints',
  templateFile: 'examples/constraints.md',
  sourceFiles: [],
  currentScore: 30,
  reason: 'always improve',
  alwaysGenerate: false,
  generateOnly: false,
};

// Long enough to pass assertWritableContent (>= 3 lines) with real headings
const GOOD_CONTENT =
  '## Scope\nProject-specific scope\n\n## Verification\nRun tests\n\n' +
  '## Artifacts\nList here\n\n## Dependencies\nNone\n\n## Rules\nFollow them';

function mockProvider(response = GOOD_CONTENT): LLMProvider {
  return {
    chat: vi.fn().mockResolvedValue(response),
    getTotalTokens: () => 0,
  };
}

let tmp: string;
let mockSpinner: {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  fail: ReturnType<typeof vi.fn>;
  text: string;
};

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'aiready-spinner-'));
  mockSpinner = {
    start: vi.fn().mockReturnThis(),
    stop: vi.fn(),
    fail: vi.fn(),
    text: '',
  };
  vi.mocked(ora).mockReturnValue(mockSpinner as ReturnType<typeof ora>);
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe('executeGenerate spinner', () => {
  it('starts and stops spinner on successful generation', async () => {
    await executeGenerate(MOCK_ITEM, tmp, {}, 1, 5, mockProvider());
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockSpinner.stop).toHaveBeenCalled();
    expect(mockSpinner.fail).not.toHaveBeenCalled();
  });

  it('updates spinner text to "Correcting headings..." before correction', async () => {
    let textAtCorrection = '';
    vi.mocked(ora).mockReturnValue({
      ...mockSpinner,
      get text() { return textAtCorrection; },
      set text(v: string) { textAtCorrection = v; },
    } as ReturnType<typeof ora>);
    await executeGenerate(MOCK_ITEM, tmp, {}, 1, 5, mockProvider());
    expect(textAtCorrection).toBe('Correcting headings...');
  });

  it('calls spinner.fail on LLM error and re-throws', async () => {
    const errorProvider: LLMProvider = {
      chat: vi.fn().mockRejectedValue(new Error('API timeout')),
      getTotalTokens: () => 0,
    };
    await expect(
      executeGenerate(MOCK_ITEM, tmp, {}, 1, 5, errorProvider),
    ).rejects.toThrow('API timeout');
    expect(mockSpinner.fail).toHaveBeenCalled();
    expect(mockSpinner.stop).not.toHaveBeenCalled();
  });

  it('does not create spinner for generateOnly artifacts', async () => {
    const generateOnlyItem: ArtifactPlan = {
      ...MOCK_ITEM,
      filename: 'Makefile',
      templateFile: 'examples/Makefile',
      generateOnly: true,
    };
    await executeGenerate(generateOnlyItem, tmp, {}, 1, 1, mockProvider());
    expect(ora).not.toHaveBeenCalled();
  });
});

describe('executeImprove spinner', () => {
  it('starts and stops spinner on successful improve', async () => {
    writeFileSync(join(tmp, 'CONSTRAINTS.md'), GOOD_CONTENT);
    await executeImprove(MOCK_IMPROVE_ITEM, tmp, {}, 1, 1, mockProvider());
    expect(mockSpinner.start).toHaveBeenCalled();
    expect(mockSpinner.stop).toHaveBeenCalled();
    expect(mockSpinner.fail).not.toHaveBeenCalled();
  });

  it('calls spinner.fail on error during improve and re-throws', async () => {
    writeFileSync(join(tmp, 'CONSTRAINTS.md'), GOOD_CONTENT);
    const errorProvider: LLMProvider = {
      chat: vi.fn().mockRejectedValue(new Error('Network error')),
      getTotalTokens: () => 0,
    };
    await expect(
      executeImprove(MOCK_IMPROVE_ITEM, tmp, {}, 1, 1, errorProvider),
    ).rejects.toThrow('Network error');
    expect(mockSpinner.fail).toHaveBeenCalled();
  });

  it('does not create spinner when file does not exist', async () => {
    await executeImprove(MOCK_IMPROVE_ITEM, tmp, {}, 1, 1, mockProvider());
    expect(ora).not.toHaveBeenCalled();
  });
});

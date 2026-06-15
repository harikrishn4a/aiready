import { describe, it, expect } from 'vitest';
import { graphifyPackageSpec, detectBackendFromEnv, BACKEND_EXTRA } from '../src/graph/index';

describe('graphifyPackageSpec', () => {
  it('appends the optional extra', () => {
    expect(graphifyPackageSpec('anthropic')).toBe('graphifyy[anthropic]');
    expect(graphifyPackageSpec('openai')).toBe('graphifyy[openai]');
  });
  it('returns the bare package when no extra', () => {
    expect(graphifyPackageSpec()).toBe('graphifyy');
  });
});

describe('detectBackendFromEnv', () => {
  it('maps each provider key to its graphify backend', () => {
    expect(detectBackendFromEnv({ ANTHROPIC_API_KEY: 'x' })).toBe('claude');
    expect(detectBackendFromEnv({ OPENAI_API_KEY: 'x' })).toBe('openai');
    expect(detectBackendFromEnv({ GEMINI_API_KEY: 'x' })).toBe('gemini');
    expect(detectBackendFromEnv({ GOOGLE_API_KEY: 'x' })).toBe('gemini');
    expect(detectBackendFromEnv({ OLLAMA_BASE_URL: 'http://localhost:11434' })).toBe('ollama');
  });

  it('follows graphify priority order (gemini > claude > openai)', () => {
    expect(detectBackendFromEnv({ ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' })).toBe('claude');
    expect(detectBackendFromEnv({ GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'x', OPENAI_API_KEY: 'y' })).toBe('gemini');
  });

  it('returns null when no backend key is present', () => {
    expect(detectBackendFromEnv({})).toBeNull();
  });
});

describe('BACKEND_EXTRA', () => {
  it('maps each backend to the right PyPI extra (claude → anthropic)', () => {
    expect(BACKEND_EXTRA['claude']).toBe('anthropic');
    expect(BACKEND_EXTRA['openai']).toBe('openai');
    expect(BACKEND_EXTRA['gemini']).toBe('gemini');
    expect(BACKEND_EXTRA['ollama']).toBe('ollama');
  });

  it('the resolved spec for an Anthropic key is graphifyy[anthropic]', () => {
    const backend = detectBackendFromEnv({ ANTHROPIC_API_KEY: 'x' })!;
    expect(graphifyPackageSpec(BACKEND_EXTRA[backend])).toBe('graphifyy[anthropic]');
  });
});

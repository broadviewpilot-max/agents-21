import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geminiJson } from '../netlify/lib/gemini.ts';

const meter = () => ({ scrapeCreators: 0, firecrawl: 0, claudeCalls: 0, geminiCalls: 0 });
const ok = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const err = (status: number, msg = 'x') => new Response(msg, { status });

describe('geminiJson resilience', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_RETRY_MS = '0'; delete process.env.GEMINI_FALLBACK_MODEL; });
  afterEach(() => vi.unstubAllGlobals());

  it('retries a 503 on the primary model and then succeeds', async () => {
    const f = vi.fn().mockResolvedValueOnce(err(503)).mockResolvedValueOnce(err(503)).mockResolvedValueOnce(ok({ a: 1 }));
    vi.stubGlobal('fetch', f);
    const m = meter();
    expect((await geminiJson<{ a: number }>(m, 'p')).a).toBe(1);
    expect(f).toHaveBeenCalledTimes(3);
    expect(m.geminiCalls).toBe(3);
  });

  it('falls back to another flash model when the primary stays overloaded', async () => {
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-backup';
    const f = vi.fn(async (url: string) => (String(url).includes('gemini-backup') ? ok({ via: 'backup' }) : err(503)));
    vi.stubGlobal('fetch', f);
    expect((await geminiJson<{ via: string }>(meter(), 'p')).via).toBe('backup');
  });

  it('reports a clear message when everything is overloaded', async () => {
    process.env.GEMINI_FALLBACK_MODEL = 'gemini-backup';
    vi.stubGlobal('fetch', vi.fn(async () => err(503, 'high demand')));
    await expect(geminiJson(meter(), 'p')).rejects.toThrow(/temporary overload/);
  });

  it('does not retry a bad request and lists models on 404', async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes('/models?') ? new Response(JSON.stringify({ models: [{ name: 'models/gemini-x-flash' }] }), { status: 200 }) : err(404, 'not found'));
    vi.stubGlobal('fetch', f);
    await expect(geminiJson(meter(), 'p')).rejects.toThrow(/gemini-x-flash/);
  });
});

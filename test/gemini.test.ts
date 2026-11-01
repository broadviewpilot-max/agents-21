import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../netlify/lib/store.ts', () => ({ getJson: async () => null, putJson: async () => {}, delKey: async () => {}, listJson: async () => [] }));
import { flashModels, geminiJson } from '../netlify/lib/gemini.ts';

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

describe('geminiJson fast test mode', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_RETRY_MS = '0'; });
  afterEach(() => vi.unstubAllGlobals());
  it('makes a single attempt with no fallback when asked, and reports it clearly', async () => {
    const f = vi.fn(async () => err(503, 'busy'));
    vi.stubGlobal('fetch', f);
    await expect(geminiJson(meter(), 'p', { attempts: 1, noFallback: true })).rejects.toThrow(/Gemini HTTP 503/);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('turns a timeout into a readable message', async () => {
    const e = new Error('aborted'); e.name = 'TimeoutError';
    vi.stubGlobal('fetch', vi.fn(async () => { throw e; }));
    await expect(geminiJson(meter(), 'p', { attempts: 1, timeoutMs: 7000, noFallback: true })).rejects.toThrow(/did not answer within 7 seconds/);
  });
});

describe('model discovery and override', () => {
  beforeEach(() => { process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_RETRY_MS = '0'; });
  afterEach(() => vi.unstubAllGlobals());
  it('lists only text flash models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ models: [{ name: 'models/gemini-a-flash' }, { name: 'models/gemini-a-flash-live' }, { name: 'models/gemini-a-pro' }, { name: 'models/gemini-b-flash-lite' }, { name: 'models/gemini-a-flash-image' }] }), { status: 200 })));
    expect(await flashModels('k')).toEqual(['gemini-a-flash', 'gemini-b-flash-lite']);
  });
  it('uses an explicit model override', async () => {
    const f = vi.fn(async () => ok({ a: 1 }));
    vi.stubGlobal('fetch', f);
    await geminiJson(meter(), 'p', { model: 'gemini-picked' });
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain('gemini-picked');
  });
});

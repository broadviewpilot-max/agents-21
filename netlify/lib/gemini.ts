import type { Meter } from './claude.ts';
import { extractJson } from './util.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash';

/** Transient Google-side errors worth retrying (overload, rate limit, brief outages). */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const retryBaseMs = () => Number(process.env.GEMINI_RETRY_MS ?? 1500);

async function flashModels(key: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const j = (await res.json()) as { models?: { name: string }[] };
  return (j.models ?? []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /gemini/.test(n) && /flash/.test(n));
}

function post(model: string, key: string, prompt: string, urlContext: boolean, timeoutMs = 50000) {
  return fetch(`${BASE}/models/${model}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt + '\n\nRespond with ONE JSON object and nothing else. No markdown fences.' }] }],
      tools: urlContext ? [{ url_context: {} }] : undefined,
      generationConfig: { temperature: 0, maxOutputTokens: 4000 },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e: unknown) => {
    const name = e instanceof Error ? e.name : '';
    if (name === 'TimeoutError' || name === 'AbortError') throw new Error(`Gemini did not answer within ${Math.round(timeoutMs / 1000)} seconds (it may be overloaded). Try again in a few minutes.`);
    throw e;
  });
}

/**
 * Ask Gemini for a JSON object. With urlContext, Gemini reads URLs found in the prompt itself.
 * Retries transient errors on the primary model, then tries one or two other flash models
 * (GEMINI_FALLBACK_MODEL, or auto-picked from the account's model list) before giving up.
 */
export async function geminiJson<T>(meter: Meter, prompt: string, opts: { urlContext?: boolean; attempts?: number; timeoutMs?: number; noFallback?: boolean } = {}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  const attempts = opts.attempts ?? 3;
  const primary = GEMINI_MODEL();

  let res: Response | undefined;
  for (let i = 0; i < attempts; i++) {
    meter.geminiCalls++;
    res = await post(primary, key, prompt, !!opts.urlContext, opts.timeoutMs);
    if (res.ok || !RETRYABLE.has(res.status)) break;
    if (i < attempts - 1) await sleep(retryBaseMs() * (i + 1));
  }

  if (!opts.noFallback && res && !res.ok && RETRYABLE.has(res.status)) {
    const configured = process.env.GEMINI_FALLBACK_MODEL;
    const others = configured ? [configured] : (await flashModels(key).catch(() => [])).filter((n) => n !== primary).sort((a, b) => Number(/lite/.test(b)) - Number(/lite/.test(a))).slice(0, 2);
    for (const m of others) {
      meter.geminiCalls++;
      const r = await post(m, key, prompt, !!opts.urlContext, opts.timeoutMs);
      if (r.ok) { res = r; break; }
    }
  }

  if (!res || !res.ok) {
    const status = res?.status ?? 0;
    const body = ((await res?.text()) ?? '').slice(0, 300);
    let hint = '';
    if (status === 404) {
      const names = await flashModels(key).catch(() => []);
      if (names.length) hint = ` Available flash models: ${names.slice(0, 8).join(', ')}. Set GEMINI_MODEL in Netlify to one of these.`;
    } else if (RETRYABLE.has(status)) {
      hint = ' Google reports this is temporary overload; the app already retried and tried backup models. Try again in a few minutes.';
    }
    throw new Error(`Gemini HTTP ${status}: ${body}${hint}`);
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return extractJson<T>(text);
}

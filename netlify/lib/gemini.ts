import type { Meter } from './claude.ts';
import { extractJson } from './util.ts';

const BASE = 'https://generativelanguage.googleapis.com/v1beta';
export const GEMINI_MODEL = () => process.env.GEMINI_MODEL || 'gemini-3.8-flash';

async function flashModels(key: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=100`, { headers: { 'x-goog-api-key': key }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) return [];
  const j = (await res.json()) as { models?: { name: string }[] };
  return (j.models ?? []).map((m) => m.name.replace(/^models\//, '')).filter((n) => /gemini/.test(n) && /flash/.test(n));
}

/** Ask Gemini for a JSON object. With urlContext, Gemini reads URLs found in the prompt itself. */
export async function geminiJson<T>(meter: Meter, prompt: string, opts: { urlContext?: boolean } = {}): Promise<T> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set');
  meter.geminiCalls++;
  const res = await fetch(`${BASE}/models/${GEMINI_MODEL()}:generateContent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt + '\n\nRespond with ONE JSON object and nothing else. No markdown fences.' }] }],
      tools: opts.urlContext ? [{ url_context: {} }] : undefined,
      generationConfig: { temperature: 0, maxOutputTokens: 4000 },
    }),
    signal: AbortSignal.timeout(50000),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    let hint = '';
    if (res.status === 404) {
      const names = await flashModels(key).catch(() => []);
      if (names.length) hint = ` Available flash models: ${names.slice(0, 8).join(', ')}. Set GEMINI_MODEL in Netlify to one of these.`;
    }
    throw new Error(`Gemini HTTP ${res.status}: ${body}${hint}`);
  }
  const j = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = (j.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  return extractJson<T>(text);
}

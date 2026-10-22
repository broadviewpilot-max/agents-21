import Anthropic from '@anthropic-ai/sdk';
import { extractJson } from './util.ts';

export interface Meter { scrapeCreators: number; firecrawl: number; claudeCalls: number }
export const newMeter = (): Meter => ({ scrapeCreators: 0, firecrawl: 0, claudeCalls: 0 });

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }));

export const MODEL = () => process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';

/** Ask Claude for a JSON object. Retries once on malformed output. */
export async function askJson<T>(meter: Meter, system: string, user: string, maxTokens = 4000): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    meter.claudeCalls++;
    const res = await getClient().messages.create({
      model: MODEL(),
      max_tokens: maxTokens,
      system: system + '\n\nRespond with ONE JSON object and nothing else. No markdown fences.',
      messages: [{ role: 'user', content: attempt === 0 ? user : user + '\n\nYour previous reply was not valid JSON. Return valid JSON only.' }],
    });
    const text = res.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
    try {
      return extractJson<T>(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Model returned invalid JSON');
}

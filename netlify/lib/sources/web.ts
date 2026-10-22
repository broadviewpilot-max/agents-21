import type { Meter } from '../claude.ts';
import { cap } from '../util.ts';

const SOCIAL = /(facebook|instagram|linkedin|twitter|x\.com|tiktok|youtube|reddit)\./i;
export const isSocial = (url: string) => SOCIAL.test(url);

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Read a page as text. Uses Firecrawl when FIRECRAWL_API_KEY is set, else plain fetch. */
export async function readPage(url: string, meter: Meter, pages: Map<string, string>, maxChars = 12000): Promise<string> {
  const hit = pages.get(url);
  if (hit !== undefined) return hit;
  let text = '';
  try {
    const fk = process.env.FIRECRAWL_API_KEY;
    if (fk) {
      const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${fk}` },
        body: JSON.stringify({ url, formats: ['markdown'], onlyMainContent: true }),
      });
      meter.firecrawl += 1;
      if (res.ok) {
        const j = (await res.json()) as { data?: { markdown?: string } };
        text = j.data?.markdown ?? '';
      }
    }
    if (!text) {
      const res = await fetch(url, { headers: { 'user-agent': 'AimsirFunderCommandCenter/0.1 (+research)' }, redirect: 'follow' });
      const ct = res.headers.get('content-type') ?? '';
      if (res.ok && ct.includes('text')) text = stripHtml(await res.text());
    }
  } catch {
    text = '';
  }
  text = cap(text, maxChars);
  pages.set(url, text);
  return text;
}

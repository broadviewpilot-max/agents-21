import type { Meter } from '../claude.ts';

const BASE = 'https://api.scrapecreators.com';

export interface SearchHit { url: string; title: string; description: string }

function maxCredits() {
  return Number(process.env.SC_MAX_CREDITS_PER_RUN || 15);
}

async function scGet<T>(path: string, params: Record<string, string>, meter: Meter): Promise<T | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return null;
  if (meter.scrapeCreators >= maxCredits()) return null; // hard per-run cap
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { 'x-api-key': key } });
  meter.scrapeCreators += 1; // all endpoints used here cost 1 credit (verified in docs)
  if (!res.ok) return null;
  return (await res.json()) as T;
}

/** GET /v1/google/search — 1 credit. */
export async function googleSearch(query: string, meter: Meter, opts: { dateRange?: string } = {}): Promise<SearchHit[]> {
  const params: Record<string, string> = { query, region: 'US' };
  if (opts.dateRange) params.date_posted = opts.dateRange;
  const data = await scGet<{ results?: SearchHit[] }>('/v1/google/search', params, meter);
  return data?.results ?? [];
}

/** GET /v1/linkedin/company/posts — 1 credit. Signals only; never a source of deadlines. */
export async function linkedinCompanyPosts(companyUrl: string, meter: Meter): Promise<{ url: string; datePublished?: string; text: string }[]> {
  const data = await scGet<{ posts?: { url: string; datePublished?: string; text: string }[] }>('/v1/linkedin/company/posts', { url: companyUrl }, meter);
  return data?.posts ?? [];
}

/** GET /v1/account/credit-balance — used by the health check. */
export async function creditBalance(): Promise<number | null> {
  const key = process.env.SCRAPECREATORS_API_KEY;
  if (!key) return null;
  const res = await fetch(`${BASE}/v1/account/credit-balance`, { headers: { 'x-api-key': key } });
  if (!res.ok) return null;
  const j = (await res.json()) as { creditCount?: number; credits_remaining?: number };
  return j.creditCount ?? j.credits_remaining ?? null;
}

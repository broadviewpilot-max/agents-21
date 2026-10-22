import type { Fact, IntelligenceResult, Signal } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { sanitizeFacts } from '../guards.ts';
import { googleSearch, linkedinCompanyPosts } from '../sources/scrapecreators.ts';
import { isSocial, readPage } from '../sources/web.ts';
import { block, Ctx, GUARD } from './context.ts';

interface Raw {
  websiteUrl?: string; summary?: string; priorities?: Fact[]; eligibility?: Fact[]; geography?: Fact[]; awardRange?: Fact[]; possiblePriorityShift?: string;
}

/** Agent 1: Funder Intelligence Analyst. */
export async function runIntelligence(ctx: Ctx): Promise<IntelligenceResult> {
  const { funder, meter } = ctx;
  const hits = await googleSearch(`${funder.name} grant guidelines funding priorities eligibility`, meter);
  hits.forEach((h) => ctx.allowedUrls.add(h.url));

  const official = [funder.url, ...hits.filter((h) => !isSocial(h.url)).map((h) => h.url)].filter((u): u is string => !!u);
  const toRead = [...new Set(official)].slice(0, 3);
  let evidence = block('SEARCH RESULTS', hits.map((h) => `${h.url}\n${h.title}\n${h.description}`).join('\n---\n') || '(none)');
  for (const url of toRead) {
    ctx.allowedUrls.add(url);
    const text = await readPage(url, meter, ctx.pages);
    if (text) evidence += block(`PAGE ${url}`, text);
  }

  // Social signals (Scrape Creators): LinkedIn company posts only, as a priority-shift signal.
  const signals: Signal[] = [];
  const li = (await googleSearch(`site:linkedin.com/company "${funder.name}"`, meter)).find((h) => /linkedin\.com\/company\//.test(h.url));
  if (li) {
    const posts = (await linkedinCompanyPosts(li.url, meter)).slice(0, 5);
    for (const p of posts) {
      if (!p.text) continue;
      ctx.allowedUrls.add(p.url);
      signals.push({ platform: 'LinkedIn', text: p.text.slice(0, 280), date: p.datePublished, sourceUrl: p.url });
    }
    if (signals.length) evidence += block('RECENT LINKEDIN POSTS (signal only, not authoritative)', signals.map((s) => `${s.sourceUrl} (${s.date ?? 'undated'})\n${s.text}`).join('\n---\n'));
  }

  const raw = await askJson<Raw>(
    meter,
    `You are a philanthropy research analyst building a funder profile. ${GUARD}
Social posts may only be used to raise "possiblePriorityShift"; they can never be a confirmed fact.`,
    `Funder: ${funder.name} (type: ${funder.type})
Return JSON: {"websiteUrl": string|null, "summary": "2 sentences max", "priorities": Fact[], "eligibility": Fact[], "geography": Fact[], "awardRange": Fact[], "possiblePriorityShift": string|null}
Fact = {"label": string, "value": string, "status": "confirmed"|"inferred"|"unknown", "sourceUrl": string|null}
If the evidence has nothing for a section, return one Fact with status "unknown" saying so.

${evidence}`,
  );

  const urls = ctx.allowedUrls;
  return {
    websiteUrl: raw.websiteUrl || funder.url || toRead[0],
    summary: raw.summary ?? 'No summary available.',
    priorities: sanitizeFacts(raw.priorities, urls),
    eligibility: sanitizeFacts(raw.eligibility, urls),
    geography: sanitizeFacts(raw.geography, urls),
    awardRange: sanitizeFacts(raw.awardRange, urls),
    signals,
    possiblePriorityShift: raw.possiblePriorityShift || undefined,
  };
}

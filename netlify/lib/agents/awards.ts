import type { Award, AwardsResult } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { computeStats, sanitizeAwards } from '../guards.ts';
import { googleSearch } from '../sources/scrapecreators.ts';
import { nonprofitPage, orgFilings, searchOrgs } from '../sources/propublica.ts';
import { isSocial, readPage } from '../sources/web.ts';
import { block, Ctx, GUARD } from './context.ts';

/** Agent 2: Awards & 990 Analyst. */
export async function runAwards(ctx: Ctx): Promise<AwardsResult> {
  const { funder, meter } = ctx;
  let evidence = '';
  let ein = funder.ein;
  let filingsUrl: string | undefined;
  const notes: string[] = [];

  // 1) Registry lookup (free). Federal programs have no 990.
  if (funder.type !== 'federal') {
    if (!ein) {
      const orgs = await searchOrgs(funder.name);
      const top = orgs[0];
      if (top) {
        ein = top.strein;
        evidence += block('PROPUBLICA SEARCH TOP MATCH (verify it is the right entity)', `${top.name}, ${top.city} ${top.state}, EIN ${top.strein}, NTEE ${top.ntee_code ?? 'n/a'}`);
      }
    }
    if (!ein) {
      // Second chance: a web search that often surfaces the EIN in registry snippets. Treated as a candidate to verify.
      const eh = await googleSearch(`"${funder.name}" EIN nonprofit 990`, meter);
      eh.forEach((h) => ctx.allowedUrls.add(h.url));
      const m = eh.map((h) => `${h.title} ${h.description}`.match(/\b\d{2}-\d{7}\b/)?.[0]).find(Boolean);
      if (m) {
        ein = m;
        evidence += block('EIN CANDIDATE FROM WEB SEARCH (unverified; confirm it is the right entity)', `${m}\n` + eh.map((h) => `${h.url} ${h.title}`).join('\n'));
      }
    }
    if (ein) {
      filingsUrl = nonprofitPage(ein);
      ctx.allowedUrls.add(filingsUrl);
      const { filings } = await orgFilings(ein);
      const latest = filings.find((f) => f.pdf_url);
      evidence += block(`PROPUBLICA FILINGS ${filingsUrl}`, filings.slice(0, 6).map((f) => `FY${f.tax_prd_yr} ${f.formtype_str ?? ''} revenue=${f.totrevenue ?? 'n/a'} grantsPaid=${f.grntspaid ?? 'n/a'}`).join('\n') || '(no filings with data)');
      if (latest?.pdf_url && ['private-foundation', 'public-charity', 'community-foundation'].includes(funder.type)) {
        ctx.allowedUrls.add(latest.pdf_url);
        const text = await readPage(latest.pdf_url, meter, ctx.pages, 20000);
        if (text) evidence += block(`LATEST 990 TEXT ${latest.pdf_url} (FY${latest.tax_prd_yr})`, text);
      }
    } else notes.push('No EIN resolved.');
  }

  // 2) Funder's own grantee / awards pages.
  const hits = await googleSearch(`${funder.name} past grantees recipients awarded grants list`, meter);
  hits.forEach((h) => ctx.allowedUrls.add(h.url));
  evidence += block('SEARCH RESULTS', hits.map((h) => `${h.url}\n${h.title}\n${h.description}`).join('\n---\n') || '(none)');
  for (const url of hits.filter((h) => !isSocial(h.url)).slice(0, 2).map((h) => h.url)) {
    const text = await readPage(url, meter, ctx.pages);
    if (text) evidence += block(`PAGE ${url}`, text);
  }

  const raw = await askJson<{ awards?: Award[]; coverageNote?: string }>(
    meter,
    `You are a grants analyst extracting PAST AWARDS (grants this funder made to other organizations) from evidence. ${GUARD}
Every award must carry a sourceUrl from the evidence or it will be discarded. Do not extract grants the funder RECEIVED.`,
    `Funder: ${funder.name}
Return JSON: {"awards":[{"recipient":string,"amount":number|null,"year":number|null,"purpose":string|null,"sourceUrl":string}],"coverageNote":"one sentence: which years/sources were covered and what is missing"}
Maximum 25 awards, most recent first.

${evidence}`,
    5000,
  );

  const awards = sanitizeAwards(raw.awards, ctx.allowedUrls);
  return {
    ein,
    awards,
    stats: computeStats(awards),
    filingsUrl,
    coverageNote: [raw.coverageNote, ...notes].filter(Boolean).join(' ') || (awards.length ? 'Coverage unknown.' : 'No past awards found in available sources.'),
  };
}

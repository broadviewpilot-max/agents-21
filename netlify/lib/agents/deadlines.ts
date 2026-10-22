import type { Deadline, DeadlinesResult } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { sanitizeDeadlines } from '../guards.ts';
import { oppUrl, searchOpportunities } from '../sources/grantsgov.ts';
import { googleSearch } from '../sources/scrapecreators.ts';
import { isSocial, readPage } from '../sources/web.ts';
import { block, Ctx, GUARD } from './context.ts';

/** Agent 3: Deadline & Pipeline Strategist. */
export async function runDeadlines(ctx: Ctx, intelligenceUrls: string[]): Promise<DeadlinesResult> {
  const { funder, meter } = ctx;
  let evidence = '';

  if (funder.type === 'federal') {
    const keyword = funder.name.replace(/grants?|program/gi, '').trim();
    const opps = await searchOpportunities(keyword);
    for (const o of opps) {
      const url = oppUrl(o.id);
      ctx.allowedUrls.add(url);
      evidence += block(`GRANTS.GOV ${url}`, `${o.number} | ${o.title} | ${o.agency} | open ${o.openDate ?? 'n/a'} | close ${o.closeDate ?? 'n/a'} | ${o.status ?? ''}`);
    }
  }

  const hits = await googleSearch(`${funder.name} grant application deadline ${new Date(ctx.today).getFullYear()}`, meter, { dateRange: 'last-year' });
  hits.forEach((h) => ctx.allowedUrls.add(h.url));
  evidence += block('SEARCH RESULTS', hits.map((h) => `${h.url}\n${h.title}\n${h.description}`).join('\n---\n') || '(none)');

  const pageUrls = [...new Set([...intelligenceUrls, ...hits.filter((h) => !isSocial(h.url)).map((h) => h.url)])].slice(0, 3);
  for (const url of pageUrls) {
    const text = await readPage(url, meter, ctx.pages);
    if (text) evidence += block(`PAGE ${url}`, text);
  }

  const raw = await askJson<{ deadlines?: Deadline[]; note?: string }>(
    meter,
    `You are a grant-calendar analyst. Today is ${ctx.today}. ${GUARD}
Only list a date if the evidence states it.
GRANTS.GOV entries are raw keyword matches and often belong to OTHER agencies or programs. Include one only if its agency/program is the funder named (e.g. for an FAA program, only FAA or Department of Transportation notices). Never list another agency's notice as this funder's deadline. Dates must be ISO YYYY-MM-DD. If a program is rolling or by invitation, add a deadline with kind "rolling" and NO date.
Only list programs plausibly relevant to Aimsir (aviation, STEM, youth education, mentorship, scholarships for students from underserved communities). Mention excluded unrelated programs in "note" instead of listing them.
Do not infer a recurring annual date from a past year unless you mark it "inferred".`,
    `Funder: ${funder.name}
Return JSON: {"deadlines":[{"label":string,"date":"YYYY-MM-DD"|null,"kind":"application"|"loi"|"rolling"|"event"|"other","status":"confirmed"|"inferred"|"unknown","sourceUrl":string|null}],"note":"one sentence on how reliable this is"}

${evidence}`,
  );

  const parsed = sanitizeDeadlines(raw.deadlines, ctx.allowedUrls);
  const merged = parsed.sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return {
    deadlines: merged,
    note: raw.note ?? (merged.length ? '' : 'No deadlines found. Unconfirmed: verify with funder.'),
  };
}

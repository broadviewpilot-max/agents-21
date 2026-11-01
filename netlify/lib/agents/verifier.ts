import type { ClaimKind, DeadlinesResult, Fact, IntelligenceResult, VerificationResult, VerifiedClaim, Verdict } from '../../../shared/types.ts';
import { geminiJson } from '../gemini.ts';
import { Ctx } from './context.ts';

const VERDICTS: Verdict[] = ['supported', 'partial', 'not_supported', 'cannot_access'];
const MAX_URLS = 6;
const MAX_CLAIMS_PER_URL = 8;

interface Claim { id: string; kind: ClaimKind; index: number; text: string; sourceUrl: string }

/** Every claim marked CONF (confirmed) with a source URL becomes a checkable claim. */
export function collectClaims(intelligence?: IntelligenceResult, deadlines?: DeadlinesResult): Claim[] {
  const claims: Claim[] = [];
  const kinds = ['priorities', 'eligibility', 'geography', 'awardRange'] as const;
  for (const k of kinds) {
    ((intelligence?.[k] ?? []) as Fact[]).forEach((f, i) => {
      if (f.status === 'confirmed' && f.sourceUrl) claims.push({ id: `${k}:${i}`, kind: k, index: i, text: `${f.label}: ${f.value}`, sourceUrl: f.sourceUrl });
    });
  }
  (deadlines?.deadlines ?? []).forEach((d, i) => {
    if (d.status === 'confirmed' && d.sourceUrl && d.date) claims.push({ id: `deadline:${i}`, kind: 'deadline', index: i, text: `${d.label} (date: ${d.date})`, sourceUrl: d.sourceUrl });
  });
  return claims;
}

/** Normalize Gemini's answer: unknown verdicts become cannot_access; "supported" needs a quote. */
export function normalizeVerdict(verdict: unknown, quote: unknown): Verdict {
  const v = VERDICTS.includes(verdict as Verdict) ? (verdict as Verdict) : 'cannot_access';
  if (v === 'supported' && !(typeof quote === 'string' && quote.trim())) return 'partial';
  return v;
}

/** Agent 6: Second-Model Verifier. An independent model (Gemini) re-reads each cited page and checks the claim. It flags; it never edits facts. */
export async function runVerifier(ctx: Ctx, inputs: { intelligence?: IntelligenceResult; deadlines?: DeadlinesResult }): Promise<VerificationResult> {
  if (!process.env.GEMINI_API_KEY) return { ran: false, skipped: 'GEMINI_API_KEY is not set, so no second-model check was run.', items: [], errors: [] };

  const claims = collectClaims(inputs.intelligence, inputs.deadlines);
  const byUrl = new Map<string, Claim[]>();
  for (const c of claims) byUrl.set(c.sourceUrl, [...(byUrl.get(c.sourceUrl) ?? []), c]);
  const urls = [...byUrl.keys()].slice(0, MAX_URLS);

  const items: VerifiedClaim[] = [];
  const errors: string[] = [];

  await Promise.all(urls.map(async (url) => {
    const group = (byUrl.get(url) ?? []).slice(0, MAX_CLAIMS_PER_URL);
    try {
      const raw = await geminiJson<{ results?: { id: string; verdict: string; quote?: string | null; note?: string | null }[] }>(
        ctx.meter,
        `You are an independent fact-checker for a grants research tool. Read the web page at ${url} and decide, for each numbered claim, whether THIS PAGE supports it.
Verdicts:
- "supported": the page states it (dates and amounts must match exactly).
- "partial": the page supports only part of it, or a date/amount/wording differs.
- "not_supported": the page does not say this, or contradicts it.
- "cannot_access": you could not read the page.
Quote a short passage (max 200 characters) from the page for "supported" or "partial". Do not use outside knowledge.
Claims:
${group.map((c) => `- id "${c.id}": ${c.text}`).join('\n')}
Return JSON: {"results":[{"id":string,"verdict":"supported"|"partial"|"not_supported"|"cannot_access","quote":string|null,"note":string|null}]}`,
        { urlContext: true },
      );
      for (const c of group) {
        const r = raw.results?.find((x) => x.id === c.id);
        items.push({
          ...c,
          verdict: r ? normalizeVerdict(r.verdict, r.quote) : 'cannot_access',
          quote: r?.quote?.slice(0, 240) || undefined,
          note: r?.note?.slice(0, 240) || (r ? undefined : 'No answer returned for this claim.'),
        });
      }
    } catch (e) {
      errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`.slice(0, 400));
      for (const c of group) items.push({ ...c, verdict: 'cannot_access', note: 'Verifier call failed.' });
    }
  }));

  return { ran: true, items, errors };
}

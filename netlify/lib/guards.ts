import type { Award, AwardStats, CriterionScore, Deadline, Fact, FitScore, ScoringConfig, Status } from '../../shared/types.ts';
import { ISO_DATE } from './util.ts';

const STATUSES: Status[] = ['confirmed', 'inferred', 'unknown'];

/**
 * Enforce "no confirmed fact without an evidence-backed source".
 * A fact marked confirmed must cite a URL that was actually in the evidence the agent saw;
 * otherwise it is downgraded to inferred (or unknown if empty).
 */
export function sanitizeFacts(facts: Fact[] | undefined, allowedUrls: Set<string>): Fact[] {
  return (facts ?? [])
    .filter((f) => f && typeof f.value === 'string' && f.value.trim())
    .map((f) => {
      let status: Status = STATUSES.includes(f.status) ? f.status : 'inferred';
      const sourceUrl = f.sourceUrl && allowedUrls.has(f.sourceUrl) ? f.sourceUrl : undefined;
      if (status === 'confirmed' && !sourceUrl) status = 'inferred';
      return { label: f.label || 'Fact', value: f.value.trim(), status, sourceUrl };
    });
}

export function sanitizeDeadlines(items: Deadline[] | undefined, allowedUrls: Set<string>): Deadline[] {
  return (items ?? [])
    .filter((d) => d && d.label)
    .map((d) => {
      const date = d.date && ISO_DATE.test(d.date) ? d.date : undefined;
      const sourceUrl = d.sourceUrl && allowedUrls.has(d.sourceUrl) ? d.sourceUrl : undefined;
      let status: Status = STATUSES.includes(d.status) ? d.status : 'inferred';
      if (!date) status = 'unknown';
      else if (status === 'confirmed' && !sourceUrl) status = 'inferred';
      return { label: d.label, date, kind: d.kind ?? 'other', status, sourceUrl };
    });
}

export function sanitizeAwards(items: Award[] | undefined, allowedUrls: Set<string>): Award[] {
  return (items ?? [])
    .filter((a) => a && a.recipient && a.recipient.trim())
    .map((a) => ({
      recipient: a.recipient.trim(),
      amount: typeof a.amount === 'number' && a.amount > 0 ? a.amount : undefined,
      year: typeof a.year === 'number' && a.year > 1990 && a.year < 2100 ? a.year : undefined,
      purpose: a.purpose,
      // Awards without an evidence-backed source are dropped: past awards must be traceable.
      sourceUrl: a.sourceUrl && allowedUrls.has(a.sourceUrl) ? a.sourceUrl : undefined,
    }))
    .filter((a) => a.sourceUrl);
}

export function computeStats(awards: Award[]): AwardStats {
  const amounts = awards.map((a) => a.amount).filter((n): n is number => typeof n === 'number').sort((a, b) => a - b);
  const years = [...new Set(awards.map((a) => a.year).filter((y): y is number => typeof y === 'number'))].sort();
  const mid = Math.floor(amounts.length / 2);
  const median = amounts.length ? (amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2) : undefined;
  return { count: awards.length, median, min: amounts[0], max: amounts[amounts.length - 1], years };
}

/** Weighted fit score. Scores are 0-10 per criterion; hard-stop flags cap the total. */
export function computeFit(
  raw: { criteria: Pick<CriterionScore, 'id' | 'score' | 'rationale' | 'evidence'>[]; flags?: string[]; hardStops?: string[]; matchedPrograms?: string[] },
  cfg: ScoringConfig,
): FitScore {
  const criteria: CriterionScore[] = cfg.criteria.map((c) => {
    const r = raw.criteria.find((x) => x.id === c.id);
    const score = Math.max(0, Math.min(10, Number.isFinite(r?.score) ? (r!.score as number) : 0));
    return { id: c.id, label: c.label, weight: c.weight, score, rationale: r?.rationale ?? 'Not assessed (no evidence).', evidence: r?.evidence };
  });
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
  let total = Math.round((criteria.reduce((s, c) => s + c.score * c.weight, 0) / (10 * totalWeight)) * 100);
  const hard = raw.hardStops ?? [];
  if (hard.length) total = Math.min(total, cfg.hardStopCap);
  const flags = [...hard.map((h) => `HARD STOP: ${h}`), ...(raw.flags ?? [])];
  const recommendation: FitScore['recommendation'] = total >= cfg.thresholds.pursue ? 'Pursue' : total >= cfg.thresholds.cultivate ? 'Cultivate' : 'Pass';
  return { total, criteria, flags, recommendation, matchedPrograms: raw.matchedPrograms ?? [] };
}

/** Numbers/dollar amounts in generated prose that do not appear in the source corpus. */
export function findUnsupportedNumbers(body: string, corpus: string): string[] {
  const tokens = body.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? [];
  const norm = (s: string) => s.replace(/[$,%]/g, '').replace(/,/g, '');
  const corpusNums = new Set((corpus.match(/\$?\d[\d,]*(?:\.\d+)?%?/g) ?? []).map(norm));
  const out = new Set<string>();
  for (const t of tokens) {
    const n = norm(t);
    if (n.length < 2) continue; // ignore single digits ("1 of 3")
    if (/^(19|20)\d{2}$/.test(n)) continue; // plain years
    if (!corpusNums.has(n)) out.add(t);
  }
  return [...out];
}

export function nextDeadline(deadlines: Deadline[] | undefined, today: string): string | undefined {
  return (deadlines ?? [])
    .filter((d) => d.date && d.date >= today && d.status !== 'unknown')
    .map((d) => d.date as string)
    .sort()[0];
}

/** Items the reviewer must resolve before approval. */
export function openItems(args: {
  deadlines: Deadline[]; awardsCount: number; inferred: number; unsupported: string[]; flags: string[]; ein?: string; missing: string[];
}): string[] {
  const items: string[] = [];
  for (const m of args.missing) items.push(`Agent did not complete: ${m}. Re-run or research manually.`);
  if (!args.deadlines.some((d) => d.date && d.status === 'confirmed')) items.push('No confirmed deadline found: verify directly with the funder.');
  for (const d of args.deadlines.filter((x) => x.status === 'inferred' && x.date)) items.push(`Deadline "${d.label}" (${d.date}) is inferred, not confirmed: verify.`);
  if (args.awardsCount === 0) items.push('No past awards found: check 990 / grantee list manually.');
  if (args.inferred > 0) items.push(`${args.inferred} priority/eligibility fact(s) are inferred rather than confirmed: verify against official guidelines.`);
  if (args.unsupported.length) items.push(`Narrative contains figures not found in source data (${args.unsupported.join(', ')}): replace with verified data or delete.`);
  for (const f of args.flags.filter((x) => x.startsWith('HARD STOP'))) items.push(f);
  return items;
}

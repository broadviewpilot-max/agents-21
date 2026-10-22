import type { FitScore } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { Ctx } from './context.ts';

/** Agent 5b: Brief Editor. Writes the one-line headline only; open items are computed in code. */
export async function runEditor(ctx: Ctx, fit: FitScore | undefined, nextDeadline: string | undefined, openCount: number): Promise<string> {
  const fallback = fit
    ? `${fit.recommendation.toUpperCase()} (${fit.total}/100). ${openCount} item(s) to verify before approval.`
    : `Fit not scored. ${openCount} item(s) to verify before approval.`;
  try {
    const r = await askJson<{ headline: string }>(
      ctx.meter,
      'You are the editor of a one-page funder brief for a nonprofit executive director. Write ONE sentence (max 30 words), conclusion first. No new facts beyond those given.',
      `Funder: ${ctx.funder.name}\nRecommendation: ${fit?.recommendation} (${fit?.total}/100)\nTop rationale: ${fit?.criteria.slice().sort((a, b) => b.weight * b.score - a.weight * a.score)[0]?.rationale}\nFlags: ${fit?.flags.join('; ') || 'none'}\nNext deadline: ${nextDeadline ?? 'unconfirmed'}\nOpen items: ${openCount}\nReturn JSON {"headline": string}`,
      400,
    );
    return r.headline?.trim() || fallback;
  } catch {
    return fallback;
  }
}

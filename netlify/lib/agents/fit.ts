import type { AwardsResult, DeadlinesResult, FitScore, IntelligenceResult, Program, ScoringConfig } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { computeFit } from '../guards.ts';
import { Ctx, GUARD } from './context.ts';

/** Agent 4: Fit Scoring Analyst. The model scores each criterion 0-10; code computes the total. */
export async function runFit(
  ctx: Ctx,
  inputs: { intelligence?: IntelligenceResult; awards?: AwardsResult; deadlines?: DeadlinesResult },
  programs: Program[],
  cfg: ScoringConfig,
): Promise<FitScore> {
  const raw = await askJson<{
    criteria: { id: string; score: number; rationale: string; evidence?: string }[];
    flags?: string[]; hardStops?: string[]; matchedPrograms?: string[];
  }>(
    ctx.meter,
    `You are a strategy analyst scoring how well a funder fits The Aimsir Foundation, an aviation and STEM access nonprofit. ${GUARD}
Score each criterion 0-10 using only the funder findings and Aimsir program list provided. If evidence is missing for a criterion, score it low (<=3) and say why.
"hardStops" are disqualifiers stated in the findings (e.g. invitation-only, wrong entity type, excluded geography, org-age minimum Aimsir cannot meet). Do not invent them.`,
    `AIMSIR PROGRAMS (draft list):
${programs.map((p) => `- [${p.id}] ${p.name}: ${p.summary} (geography: ${p.geography})`).join('\n')}

CRITERIA:
${cfg.criteria.map((c) => `- ${c.id} (${c.label}, weight ${c.weight}): ${c.guide}`).join('\n')}

FUNDER FINDINGS:
${JSON.stringify(inputs, null, 1).slice(0, 14000)}

Return JSON: {"criteria":[{"id":string,"score":number,"rationale":"one sentence","evidence":"quote or fact from findings"}],"flags":[string],"hardStops":[string],"matchedPrograms":[program ids]}`,
  );
  const fit = computeFit(raw, cfg);
  fit.matchedPrograms = (raw.matchedPrograms ?? []).filter((id) => programs.some((p) => p.id === id));
  return fit;
}

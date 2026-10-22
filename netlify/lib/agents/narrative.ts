import type { FitScore, IntelligenceResult, NarrativeSection, Program } from '../../../shared/types.ts';
import { askJson } from '../claude.ts';
import { findUnsupportedNumbers, narrativeClaimFlags } from '../guards.ts';
import profile from '../../../config/aimsir-profile.json';
import { Ctx } from './context.ts';

const SECTIONS = [
  { id: 'overview', title: 'Organizational Overview' },
  { id: 'need', title: 'Statement of Need' },
  { id: 'program', title: 'Program Description' },
  { id: 'alignment', title: 'Alignment with Funder Priorities' },
];

export const profileCorpus = (programs: Program[]) =>
  JSON.stringify(profile) + ' ' + programs.map((p) => `${p.name} ${p.summary} ${p.audience} ${p.geography}`).join(' ');

/** Agent 5a: Narrative Drafter. Aimsir facts come only from config; funder claims from findings. */
export async function runNarrative(
  ctx: Ctx,
  intelligence: IntelligenceResult | undefined,
  fit: FitScore | undefined,
  programs: Program[],
): Promise<{ sections: NarrativeSection[]; unsupported: string[]; claimFlags: string[] }> {
  const matched = programs.filter((p) => fit?.matchedPrograms.includes(p.id));
  const use = matched.length ? matched : programs.slice(0, 2);
  const corpus = profileCorpus(programs) + ' ' + JSON.stringify(intelligence ?? {});

  const raw = await askJson<{ sections: { id: string; body: string; needsData?: string[] }[] }>(
    ctx.meter,
    `You are a grant writer for The Aimsir Foundation. Voice: an aviation practitioner (airline captain and check airman) speaking directly to a funder; formal, precise, no marketing fluff.
Rules:
- Aimsir facts come ONLY from the PROFILE and PROGRAMS below. Funder facts come ONLY from FUNDER FINDINGS.
- Never state participant counts, outcomes, percentages, dollar totals or statistics that are not in those inputs. Where a figure would help, write [INSERT VERIFIED DATA: what is needed].
- Self-reported claims must be phrased as Aimsir's own statements ("Aimsir reports...").
- FIRST-PERSON VOICE: Sean's credentials in PROFILE.founderCredentials may be stated in first person and should be used where they add credibility (e.g. "As an airline captain and check airman with more than 32 years of professional flying..."). State only the credentials listed there. NEVER name the airline/employer.
- Any observation drawn from Sean's own experience must be phrased as "In my experience..." and must not use superlatives, comparatives about all students, or statistics ("most likely", "the majority", "always"). If a stronger claim would help, replace it with an [INSERT VERIFIED DATA: ...] placeholder.
- Never include participant-level detail; keep minors generic.
- Do not claim eligibility, registration (SAM.gov etc.) or partnerships beyond the PROFILE.
- Funder-facing prose must read as finished, confident text. NEVER write sentences like "we have not confirmed", "we have not yet assembled", or "status unknown" in the body. Put every uncertainty in a bracketed [INSERT VERIFIED DATA: ...] placeholder and list it in needsData.
- Do not make commitments or scope statements about what Aimsir will or will not request, offer, or do beyond the PROFILE and PROGRAMS.
- 90-140 words per section.`,
    `PROFILE:\n${JSON.stringify(profile, null, 1)}\n\nPROGRAMS TO FEATURE:\n${use.map((p) => `- ${p.name}: ${p.summary}`).join('\n')}\n\nFUNDER: ${ctx.funder.name}\nFUNDER FINDINGS:\n${JSON.stringify(intelligence ?? {}, null, 1).slice(0, 9000)}\n\nFIT RATIONALE:\n${(fit?.criteria ?? []).map((c) => `${c.label}: ${c.rationale}`).join('\n')}\n\nReturn JSON: {"sections":[{"id":"overview|need|program|alignment","body":string,"needsData":[strings describing data to insert]}]} for ids ${SECTIONS.map((s) => s.id).join(', ')}.`,
    4500,
  );

  const unsupported: string[] = [];
  const claimFlags: string[] = [];
  const sections: NarrativeSection[] = SECTIONS.map((s) => {
    const r = raw.sections?.find((x) => x.id === s.id);
    const body = r?.body?.trim() || '[Section not generated]';
    unsupported.push(...findUnsupportedNumbers(body, corpus));
    claimFlags.push(...narrativeClaimFlags(body).map((f) => `${s.title}: ${f}`));
    return { id: s.id, title: s.title, body, needsData: r?.needsData ?? [] };
  });
  return { sections, unsupported: [...new Set(unsupported)], claimFlags };
}

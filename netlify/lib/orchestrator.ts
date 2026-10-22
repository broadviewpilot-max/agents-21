import type { AgentLog, Brief, Funder, Program, Run, ScoringConfig } from '../../shared/types.ts';
import { runAwards } from './agents/awards.ts';
import type { Ctx } from './agents/context.ts';
import { runDeadlines } from './agents/deadlines.ts';
import { runEditor } from './agents/editor.ts';
import { runFit } from './agents/fit.ts';
import { runIntelligence } from './agents/intelligence.ts';
import { runNarrative } from './agents/narrative.ts';
import { newMeter } from './claude.ts';
import { nextDeadline, openItems } from './guards.ts';
import defaultPrograms from '../../config/aimsir-programs.json';
import defaultScoring from '../../config/scoring.json';
import { getJson, putJson } from './store.ts';
import { uid } from './util.ts';

export const loadPrograms = async (): Promise<Program[]> =>
  (await getJson<Program[]>('config', 'programs')) ?? (defaultPrograms.programs as Program[]);
export const loadScoring = async (): Promise<ScoringConfig> =>
  (await getJson<ScoringConfig>('config', 'scoring')) ?? (defaultScoring as ScoringConfig);

/** Pipeline: Intelligence -> (Awards || Deadlines) -> Fit -> Narrative -> Editor. Each step degrades to "unknown", never fabricates. */
export async function runPipeline(runId: string): Promise<void> {
  const run = await getJson<Run>('runs', runId);
  if (!run) return;
  const funder = await getJson<Funder>('funders', run.funderId);
  if (!funder) return;

  const meter = newMeter();
  const ctx: Ctx = { funder, meter, pages: new Map(), allowedUrls: new Set(), today: new Date().toISOString().slice(0, 10) };
  const save = async () => {
    run.creditsUsed = { ...meter };
    await putJson('runs', run.id, run);
  };
  const step = async <T>(agent: string, fn: () => Promise<T>): Promise<T | undefined> => {
    const t0 = Date.now();
    const log: AgentLog = { agent, ok: true, ms: 0 };
    try {
      return await fn();
    } catch (e) {
      log.ok = false;
      log.note = e instanceof Error ? e.message : String(e);
      return undefined;
    } finally {
      log.ms = Date.now() - t0;
      run.logs.push(log);
      await save();
    }
  };

  try {
    run.status = 'running';
    await save();
    const [programs, scoring] = await Promise.all([loadPrograms(), loadScoring()]);

    run.intelligence = await step('Funder Intelligence Analyst', () => runIntelligence(ctx));
    await save();
    const iUrls = [run.intelligence?.websiteUrl, ...(run.intelligence?.priorities ?? []).map((f) => f.sourceUrl)].filter((u): u is string => !!u);

    const [awards, deadlines] = await Promise.all([
      step('Awards & 990 Analyst', () => runAwards(ctx)),
      step('Deadline & Pipeline Strategist', () => runDeadlines(ctx, iUrls)),
    ]);
    run.awards = awards;
    run.deadlines = deadlines;
    await save();

    run.fit = await step('Fit Scoring Analyst', () => runFit(ctx, { intelligence: run.intelligence, awards, deadlines }, programs, scoring));
    await save();

    const narr = await step('Narrative Drafter', () => runNarrative(ctx, run.intelligence, run.fit, programs));
    run.narrative = narr?.sections;

    const missing = run.logs.filter((l) => !l.ok).map((l) => l.agent);
    const inferred = [...(run.intelligence?.priorities ?? []), ...(run.intelligence?.eligibility ?? [])].filter((f) => f.status !== 'confirmed').length;
    const items = openItems({
      deadlines: deadlines?.deadlines ?? [], awardsCount: awards?.awards.length ?? 0, inferred,
      unsupported: narr?.unsupported ?? [], claimFlags: narr?.claimFlags ?? [], flags: run.fit?.flags ?? [], ein: awards?.ein, missing,
    });
    const next = nextDeadline(deadlines?.deadlines, ctx.today);
    const headline = await step('Brief Editor', () => runEditor(ctx, run.fit, next, items.length));

    const prior = await getJson<Brief>('briefs', funder.briefId ?? '_none');
    const now = new Date().toISOString();
    const brief: Brief = {
      id: uid('brief'), funderId: funder.id, runId: run.id, version: (prior?.version ?? 0) + 1, state: 'draft',
      headline: headline ?? 'Brief generated with incomplete data. Review open items.', openItems: items,
      narrative: run.narrative ?? [], createdAt: now, updatedAt: now,
    };
    await putJson('briefs', brief.id, brief);

    funder.briefId = brief.id;
    funder.latestRunId = run.id;
    funder.deadlines = deadlines?.deadlines;
    funder.nextDeadline = next;
    funder.fitTotal = run.fit?.total;
    funder.recommendation = run.fit?.recommendation;
    if (awards?.ein && !funder.ein) funder.ein = awards.ein;
    if (run.intelligence?.websiteUrl && !funder.url) funder.url = run.intelligence.websiteUrl;
    if (funder.stage === 'researching') funder.stage = 'brief-ready';
    await putJson('funders', funder.id, funder);

    run.status = 'done';
  } catch (e) {
    run.status = 'failed';
    run.error = e instanceof Error ? e.message : String(e);
  } finally {
    run.finishedAt = new Date().toISOString();
    await save();
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Brief, Funder, Run } from '../shared/types.ts';

const db = new Map<string, unknown>();
vi.mock('../netlify/lib/store.ts', () => ({
  getJson: async (s: string, k: string) => db.get(`${s}/${k}`) ?? null,
  putJson: async (s: string, k: string, v: unknown) => void db.set(`${s}/${k}`, JSON.parse(JSON.stringify(v))),
  delKey: async (s: string, k: string) => void db.delete(`${s}/${k}`),
  listJson: async (s: string) => [...db.entries()].filter(([k]) => k.startsWith(`${s}/`)).map(([, v]) => v),
}));

// Scripted model: returns canned JSON keyed by which agent is asking (system prompt content).
vi.mock('../netlify/lib/claude.ts', () => ({
  newMeter: () => ({ scrapeCreators: 0, firecrawl: 0, claudeCalls: 0, geminiCalls: 0 }),
  askJson: async (meter: { claudeCalls: number }, system: string) => {
    meter.claudeCalls++;
    if (system.includes('philanthropy research analyst'))
      return {
        websiteUrl: 'https://funder.example/', summary: 'Funds STEM access.',
        priorities: [
          { label: 'Focus', value: 'STEM education for youth', status: 'confirmed', sourceUrl: 'https://funder.example/guidelines' },
          { label: 'Made up', value: 'Aviation only', status: 'confirmed', sourceUrl: 'https://invented.example/' },
        ],
        eligibility: [], geography: [], awardRange: [],
      };
    if (system.includes('extracting PAST AWARDS'))
      return { awards: [{ recipient: 'Youth Wings', amount: 25000, year: 2025, sourceUrl: 'https://funder.example/guidelines' }, { recipient: 'Ghost', amount: 1, sourceUrl: 'https://nope' }], coverageNote: 'FY2025 only.' };
    if (system.includes('grant-calendar analyst'))
      return { deadlines: [{ label: 'LOI', date: '2027-03-01', kind: 'loi', status: 'confirmed', sourceUrl: 'https://funder.example/guidelines' }], note: 'From guidelines page.' };
    if (system.includes('strategy analyst'))
      return { criteria: [{ id: 'mission', score: 9, rationale: 'STEM youth' }, { id: 'program', score: 8, rationale: 'FFF' }, { id: 'eligibility', score: 7, rationale: 'ok' }, { id: 'size', score: 6, rationale: 'ok' }, { id: 'history', score: 8, rationale: 'one award' }, { id: 'timing', score: 7, rationale: 'ok' }], flags: [], hardStops: [], matchedPrograms: ['first-flight-forward', 'bogus-id'] };
    if (system.includes('grant writer'))
      return { sections: [{ id: 'overview', body: 'Aimsir fully funds 10 students. We have served 4,000 youth.', needsData: [] }, { id: 'need', body: 'x', needsData: [] }, { id: 'program', body: 'y', needsData: [] }, { id: 'alignment', body: 'z', needsData: [] }] };
    if (system.includes('editor of a one-page')) return { headline: 'Pursue: strong STEM-youth fit; LOI due 2027-03-01.' };
    throw new Error('unexpected agent prompt');
  },
}));

vi.mock('../netlify/lib/gemini.ts', () => ({
  GEMINI_MODEL: () => 'gemini-test',
  geminiJson: async (meter: { geminiCalls: number }) => {
    meter.geminiCalls++;
    return { results: [{ id: 'priorities:0', verdict: 'supported', quote: 'We fund STEM education for youth.' }, { id: 'deadline:0', verdict: 'not_supported', note: 'Page lists a different date.' }] };
  },
}));
vi.mock('../netlify/lib/sources/scrapecreators.ts', () => ({
  googleSearch: async () => [{ url: 'https://funder.example/guidelines', title: 'Guidelines', description: 'Funding priorities' }],
  linkedinCompanyPosts: async () => [],
}));
vi.mock('../netlify/lib/sources/web.ts', () => ({ isSocial: () => false, readPage: async () => 'Guidelines text' }));
vi.mock('../netlify/lib/sources/propublica.ts', () => ({ searchOrgs: async () => [], orgFilings: async () => ({ filings: [] }), nonprofitPage: (e: string) => `https://pp/${e}` }));
vi.mock('../netlify/lib/sources/grantsgov.ts', () => ({ searchOpportunities: async () => [], oppUrl: (i: string) => i, toIso: () => undefined }));

import { runPipeline } from '../netlify/lib/orchestrator.ts';

describe('pipeline end-to-end (mocked IO)', () => {
  beforeEach(() => { db.clear(); process.env.GEMINI_API_KEY = 'test-key'; });

  it('produces a guarded brief: downgrades uncited facts, drops untraceable awards, flags invented numbers', async () => {
    const funder: Funder = { id: 'f1', name: 'Example Foundation', type: 'private-foundation', createdAt: 'now', stage: 'researching' };
    db.set('funders/f1', funder);
    db.set('runs/r1', { id: 'r1', funderId: 'f1', status: 'queued', startedAt: 'now', creditsUsed: { scrapeCreators: 0, firecrawl: 0, claudeCalls: 0 }, logs: [] } satisfies Run);

    await runPipeline('r1');

    const run = db.get('runs/r1') as Run;
    expect(run.status).toBe('done');
    expect(run.logs.every((l) => l.ok)).toBe(true);
    expect(run.intelligence!.priorities.map((p) => p.status)).toEqual(['confirmed', 'inferred']);
    expect(run.awards!.awards).toHaveLength(1);
    expect(run.deadlines!.deadlines[0].status).toBe('confirmed');
    expect(run.fit!.recommendation).toBe('Pursue');
    expect(run.fit!.matchedPrograms).toEqual(['first-flight-forward']);

    const f = db.get('funders/f1') as Funder;
    expect(f.stage).toBe('brief-ready');
    expect(f.nextDeadline).toBe('2027-03-01');
    const brief = db.get(`briefs/${f.briefId}`) as Brief;
    expect(brief.state).toBe('draft');
    expect(brief.openItems.some((i) => i.includes('4,000'))).toBe(true); // invented figure flagged
    expect(brief.openItems.some((i) => i.includes('inferred'))).toBe(true);
    expect(brief.narrative).toHaveLength(4);

    // Second-model verifier: supported claim tagged, contradicted deadline surfaces as a verify item.
    expect(run.verification?.ran).toBe(true);
    expect(run.verification!.items.find((c) => c.id === 'priorities:0')?.verdict).toBe('supported');
    expect(run.verification!.items.find((c) => c.id === 'deadline:0')?.verdict).toBe('not_supported');
    expect(brief.openItems.some((i) => i.startsWith('Second-model check') && i.includes('LOI'))).toBe(true);
    expect(run.creditsUsed.geminiCalls).toBeGreaterThan(0);
  });

  it('skips the verifier cleanly when no Gemini key is set', async () => {
    delete process.env.GEMINI_API_KEY;
    db.set('funders/f2', { id: 'f2', name: 'Example Foundation', type: 'private-foundation', createdAt: 'now', stage: 'researching' } satisfies Funder);
    db.set('runs/r2', { id: 'r2', funderId: 'f2', status: 'queued', startedAt: 'now', creditsUsed: { scrapeCreators: 0, firecrawl: 0, claudeCalls: 0 }, logs: [] } satisfies Run);
    await runPipeline('r2');
    const run = db.get('runs/r2') as Run;
    expect(run.status).toBe('done');
    expect(run.verification?.ran).toBe(false);
    expect(run.verification?.skipped).toContain('GEMINI_API_KEY');
  });
});

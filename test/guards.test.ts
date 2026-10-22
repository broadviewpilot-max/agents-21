import { describe, expect, it } from 'vitest';
import scoring from '../config/scoring.json';
import type { Funder, ScoringConfig } from '../shared/types.ts';
import { computeFit, computeStats, findUnsupportedNumbers, nextDeadline, openItems, sanitizeAwards, sanitizeDeadlines, sanitizeFacts } from '../netlify/lib/guards.ts';
import { buildIcs } from '../netlify/lib/ics.ts';
import { toIso } from '../netlify/lib/sources/grantsgov.ts';
import { extractJson } from '../netlify/lib/util.ts';

const cfg = scoring as ScoringConfig;
const urls = new Set(['https://a.org/x']);

describe('sanitizeFacts', () => {
  it('downgrades confirmed facts that cite a URL not in the evidence', () => {
    const out = sanitizeFacts([{ label: 'p', value: 'STEM', status: 'confirmed', sourceUrl: 'https://made-up.com' }], urls);
    expect(out[0].status).toBe('inferred');
    expect(out[0].sourceUrl).toBeUndefined();
  });
  it('keeps confirmed facts with an evidence-backed URL', () => {
    expect(sanitizeFacts([{ label: 'p', value: 'STEM', status: 'confirmed', sourceUrl: 'https://a.org/x' }], urls)[0].status).toBe('confirmed');
  });
});

describe('sanitizeDeadlines', () => {
  it('marks undated items unknown and rejects malformed dates', () => {
    const out = sanitizeDeadlines([{ label: 'a', date: 'March 3', kind: 'application', status: 'confirmed', sourceUrl: 'https://a.org/x' }], urls);
    expect(out[0].status).toBe('unknown');
    expect(out[0].date).toBeUndefined();
  });
  it('downgrades confirmed deadline without evidence-backed source', () => {
    expect(sanitizeDeadlines([{ label: 'a', date: '2027-03-01', kind: 'application', status: 'confirmed' }], urls)[0].status).toBe('inferred');
  });
});

describe('awards', () => {
  it('drops awards without an evidence-backed source and computes stats', () => {
    const awards = sanitizeAwards([
      { recipient: 'A', amount: 100, year: 2024, sourceUrl: 'https://a.org/x' },
      { recipient: 'B', amount: 300, year: 2025, sourceUrl: 'https://a.org/x' },
      { recipient: 'C', amount: 999, sourceUrl: 'https://fake' },
    ], urls);
    expect(awards).toHaveLength(2);
    const s = computeStats(awards);
    expect(s).toMatchObject({ count: 2, median: 200, min: 100, max: 300, years: [2024, 2025] });
  });
});

describe('computeFit', () => {
  const all = (score: number) => cfg.criteria.map((c) => ({ id: c.id, score, rationale: 'r' }));
  it('weights sum to 100', () => expect(cfg.criteria.reduce((s, c) => s + c.weight, 0)).toBe(100));
  it('scores 10s as 100 / Pursue', () => {
    const f = computeFit({ criteria: all(10) }, cfg);
    expect(f.total).toBe(100);
    expect(f.recommendation).toBe('Pursue');
  });
  it('hard stop caps the total and flags it', () => {
    const f = computeFit({ criteria: all(10), hardStops: ['invitation only'] }, cfg);
    expect(f.total).toBe(cfg.hardStopCap);
    expect(f.recommendation).toBe('Pass');
    expect(f.flags[0]).toContain('HARD STOP');
  });
  it('missing criteria score zero rather than being invented', () => {
    expect(computeFit({ criteria: [] }, cfg).total).toBe(0);
  });
  it('clamps out-of-range scores', () => {
    expect(computeFit({ criteria: all(99) }, cfg).total).toBe(100);
  });
});

describe('findUnsupportedNumbers', () => {
  const corpus = 'Aimsir fully funds 10 students and awards $10,000 scholarships. Invested more than $30,000.';
  it('allows numbers present in sources and plain years', () => {
    expect(findUnsupportedNumbers('We fund 10 students with a $10,000 award in 2026.', corpus)).toEqual([]);
  });
  it('flags invented figures', () => {
    expect(findUnsupportedNumbers('We served 500 students, 85% graduating.', corpus)).toEqual(['500', '85%']);
  });
});

describe('misc', () => {
  it('nextDeadline ignores past and unknown', () => {
    expect(nextDeadline([
      { label: 'a', date: '2026-01-01', kind: 'other', status: 'confirmed' },
      { label: 'b', date: '2027-02-01', kind: 'other', status: 'confirmed' },
      { label: 'c', date: '2026-12-01', kind: 'other', status: 'unknown' },
    ], '2026-10-21')).toBe('2027-02-01');
  });
  it('openItems flags missing confirmed deadline and no awards', () => {
    const items = openItems({ deadlines: [], awardsCount: 0, inferred: 2, unsupported: ['500'], flags: ['HARD STOP: x'], missing: [] });
    expect(items.length).toBe(5);
  });
  it('toIso converts Grants.gov dates', () => expect(toIso('03/15/2027')).toBe('2027-03-15'));
  it('extractJson tolerates surrounding prose', () => expect(extractJson<{ a: number }>('here: {"a":1} done').a).toBe(1));
  it('ics only emits dated, known deadlines and marks inferred', () => {
    const f = { id: 'f1', name: 'Fund, Inc', deadlines: [
      { label: 'LOI', date: '2027-03-01', kind: 'loi', status: 'inferred' },
      { label: 'x', kind: 'rolling', status: 'unknown' },
    ] } as unknown as Funder;
    const ics = buildIcs([f], new Date('2026-10-21T00:00:00Z'));
    expect(ics).toContain('DTSTART;VALUE=DATE:20270301');
    expect(ics).toContain('DTEND;VALUE=DATE:20270302');
    expect(ics).toContain('(UNVERIFIED)');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });
});

import { authorized } from '../netlify/lib/util.ts';
describe('access mode', () => {
  const req = (pw?: string) => new Request('https://x/api/funders', { headers: pw ? { 'x-app-password': pw } : {} });
  it('is open when APP_PASSWORD is unset', () => { delete process.env.APP_PASSWORD; expect(authorized(req())).toBe(true); });
  it('enforces the password once set', () => {
    process.env.APP_PASSWORD = 'secret-pass';
    expect(authorized(req())).toBe(false);
    expect(authorized(req('wrong-pass!'))).toBe(false);
    expect(authorized(req('secret-pass'))).toBe(true);
    delete process.env.APP_PASSWORD;
  });
});

import { isOfficialSite } from '../netlify/lib/agents/intelligence.ts';
describe('official site filter', () => {
  it('rejects directory sites and accepts funder domains', () => {
    expect(isOfficialSite('https://www.insidephilanthropy.com/find-a-grant/grants-g/ge-foundation')).toBe(false);
    expect(isOfficialSite('https://www.ge.com/aerospace/foundation')).toBe(true);
    expect(isOfficialSite(undefined)).toBe(false);
  });
});

import { normalizeEin, normalizeUrl } from '../netlify/lib/util.ts';
describe('funder detail validation', () => {
  it('normalizes EINs', () => {
    expect(normalizeEin('222621967')).toBe('22-2621967');
    expect(normalizeEin('22-2621967')).toBe('22-2621967');
    expect(normalizeEin('')).toBe('');
    expect(normalizeEin('12-345')).toBeNull();
    expect(normalizeEin('ab-cdefghi')).toBeNull();
  });
  it('normalizes and validates URLs', () => {
    expect(normalizeUrl('geaerospace.com')).toBe('https://geaerospace.com/');
    expect(normalizeUrl('')).toBe('');
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });
});

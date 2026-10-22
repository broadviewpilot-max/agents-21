import type { Config } from '@netlify/functions';
import seed from '../../config/funders-seed.json';
import type { Brief, BriefState, Funder, FunderType, Program, Run, ScoringConfig, Stage } from '../../shared/types.ts';
import { buildIcs } from '../lib/ics.ts';
import { loadPrograms, loadScoring } from '../lib/orchestrator.ts';
import { askJson, newMeter } from '../lib/claude.ts';
import { creditBalance } from '../lib/sources/scrapecreators.ts';
import { delKey, getJson, listJson, putJson } from '../lib/store.ts';
import { authorized, isOpen, json, uid } from '../lib/util.ts';

export const config: Config = { path: '/api/*' };

const STAGES: Stage[] = ['researching', 'brief-ready', 'approved', 'drafting', 'submitted', 'awarded', 'declined'];
const TYPES: FunderType[] = ['federal', 'corporate', 'private-foundation', 'public-charity', 'community-foundation', 'state-local', 'other'];

async function createFunder(name: string, type: FunderType, url?: string, ein?: string): Promise<Funder> {
  const f: Funder = { id: uid('fund'), name: name.trim(), type, url: url || undefined, ein: ein || undefined, createdAt: new Date().toISOString(), stage: 'researching' };
  await putJson('funders', f.id, f);
  return f;
}

async function startRun(req: Request, funderId: string): Promise<Run | null> {
  const funder = await getJson<Funder>('funders', funderId);
  if (!funder) return null;
  // Cost guard (matters most in open mode): cap research runs per UTC day.
  const today = new Date().toISOString().slice(0, 10);
  const cap = Number(process.env.MAX_RUNS_PER_DAY || 25);
  const todays = (await listJson<Run>('runs')).filter((r) => r.startedAt.startsWith(today)).length;
  if (todays >= cap) throw new Error(`Daily run limit reached (${cap}). Raise MAX_RUNS_PER_DAY or try tomorrow.`);
  const run: Run = {
    id: uid('run'), funderId, status: 'queued', startedAt: new Date().toISOString(),
    creditsUsed: { scrapeCreators: 0, firecrawl: 0, claudeCalls: 0 }, logs: [],
  };
  await putJson('runs', run.id, run);
  // Fire the background function; it should answer 202 right away. If it does not, record why instead of leaving the run "queued" forever.
  try {
    const res = await fetch(new URL('/.netlify/functions/run-background', req.url), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-app-password': req.headers.get('x-app-password') ?? '' },
      body: JSON.stringify({ runId: run.id }),
    });
    if (!res.ok) throw new Error(`Background function answered HTTP ${res.status}${res.status === 404 ? ' (not deployed?)' : res.status === 401 ? ' (password mismatch)' : ''}`);
  } catch (e) {
    run.status = 'failed';
    run.error = `Could not start research job: ${e instanceof Error ? e.message : String(e)}`;
    run.finishedAt = new Date().toISOString();
    await putJson('runs', run.id, run);
  }
  return run;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const seg = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const [root, id, sub] = seg;
  const method = req.method;

  if (!authorized(req)) return json({ error: 'Unauthorized' }, 401);

  try {
    if (root === 'session') return json({ ok: true, open: isOpen() });

    if (root === 'health' && id === 'claude' && method === 'POST') {
      try {
        const r = await askJson<{ ok: boolean }>(newMeter(), 'Reply with JSON only.', 'Return {"ok": true}', 50);
        return json({ ok: !!r.ok });
      } catch (e) {
        return json({ ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
    if (root === 'health') {
      return json({
        open: isOpen(),
        scrapeCreatorsKey: !!process.env.SCRAPECREATORS_API_KEY,
        scrapeCreatorsCredits: await creditBalance(),
        anthropicKey: !!process.env.ANTHROPIC_API_KEY,
        firecrawlKey: !!process.env.FIRECRAWL_API_KEY,
        model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5',
        scCreditCapPerRun: Number(process.env.SC_MAX_CREDITS_PER_RUN || 15),
      });
    }

    if (root === 'funders') {
      if (!id && method === 'GET') return json(await listJson<Funder>('funders'));
      if (!id && method === 'POST') {
        const b = (await req.json()) as { name?: string; type?: FunderType; url?: string; ein?: string };
        if (!b.name?.trim()) return json({ error: 'name required' }, 400);
        return json(await createFunder(b.name, TYPES.includes(b.type as FunderType) ? (b.type as FunderType) : 'other', b.url, b.ein), 201);
      }
      if (id === 'seed' && method === 'POST') {
        const existing = new Set((await listJson<Funder>('funders')).map((f) => f.name));
        const added: Funder[] = [];
        for (const s of seed.funders) if (!existing.has(s.name)) added.push(await createFunder(s.name, s.type as FunderType));
        return json(added, 201);
      }
      if (id && method === 'PATCH') {
        const f = await getJson<Funder>('funders', id);
        if (!f) return json({ error: 'not found' }, 404);
        const b = (await req.json()) as Partial<Pick<Funder, 'stage' | 'notes' | 'url' | 'ein'>>;
        if (b.stage && STAGES.includes(b.stage)) f.stage = b.stage;
        if (typeof b.notes === 'string') f.notes = b.notes;
        if (typeof b.url === 'string') f.url = b.url || undefined;
        if (typeof b.ein === 'string') f.ein = b.ein || undefined;
        await putJson('funders', f.id, f);
        return json(f);
      }
      if (id && method === 'DELETE') { await delKey('funders', id); return json({ ok: true }); }
    }

    if (root === 'runs') {
      if (!id && method === 'POST') {
        const { funderId } = (await req.json()) as { funderId: string };
        const run = await startRun(req, funderId);
        return run ? json(run, 202) : json({ error: 'funder not found' }, 404);
      }
      if (id && method === 'GET') {
        const r = await getJson<Run>('runs', id);
        return r ? json(r) : json({ error: 'not found' }, 404);
      }
    }

    if (root === 'briefs' && id) {
      const b = await getJson<Brief>('briefs', id);
      if (!b) return json({ error: 'not found' }, 404);
      if (method === 'GET') {
        const run = await getJson<Run>('runs', b.runId);
        const funder = await getJson<Funder>('funders', b.funderId);
        return json({ brief: b, run, funder });
      }
      if (method === 'PATCH') {
        const p = (await req.json()) as { headline?: string; narrative?: Brief['narrative']; state?: BriefState; overrideNote?: string; resolvedItems?: string[] };
        if (typeof p.headline === 'string') b.headline = p.headline;
        if (Array.isArray(p.narrative)) b.narrative = p.narrative;
        if (Array.isArray(p.resolvedItems)) b.openItems = b.openItems.filter((i) => !p.resolvedItems!.includes(i));
        if (p.state) {
          // Review gate: cannot approve with unresolved items unless the reviewer records an override note.
          if (p.state === 'approved' && b.openItems.length && !p.overrideNote?.trim()) {
            return json({ error: `${b.openItems.length} open item(s) unresolved. Resolve them or add an override note.` }, 409);
          }
          b.state = p.state;
          if (p.state === 'approved') {
            b.overrideNote = p.overrideNote?.trim() || undefined;
            const f = await getJson<Funder>('funders', b.funderId);
            if (f && (f.stage === 'researching' || f.stage === 'brief-ready')) { f.stage = 'approved'; await putJson('funders', f.id, f); }
          }
        }
        b.updatedAt = new Date().toISOString();
        await putJson('briefs', b.id, b);
        return json(b);
      }
    }

    if (root === 'programs') {
      if (method === 'GET') return json(await loadPrograms());
      if (method === 'PUT') {
        const list = (await req.json()) as Program[];
        if (!Array.isArray(list) || list.some((p) => !p.id || !p.name)) return json({ error: 'invalid programs' }, 400);
        await putJson('config', 'programs', list);
        return json(list);
      }
    }

    if (root === 'scoring') {
      if (method === 'GET') return json(await loadScoring());
      if (method === 'PUT') {
        const cfg = (await req.json()) as ScoringConfig;
        const sum = cfg.criteria?.reduce((s, c) => s + c.weight, 0);
        if (sum !== 100) return json({ error: `weights must sum to 100 (got ${sum})` }, 400);
        await putJson('config', 'scoring', cfg);
        return json(cfg);
      }
    }

    if (root === 'calendar.ics' && method === 'GET') {
      return new Response(buildIcs(await listJson<Funder>('funders')), {
        headers: { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="aimsir-funder-deadlines.ics"' },
      });
    }
    void sub;
    return json({ error: 'Not found' }, 404);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Server error' }, 500);
  }
};

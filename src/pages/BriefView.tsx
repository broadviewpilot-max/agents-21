import { useEffect, useState } from 'react';
import type { Brief, Fact, Funder, Run } from '../../shared/types.ts';
import { api, money, patch, post } from '../api.ts';
import { DeadlineBadge } from './Pipeline.tsx';

const Tag = ({ s }: { s: string }) => <span className={`stat-tag ${s}`}>{s === 'confirmed' ? 'CONF' : s === 'inferred' ? 'INFER' : 'UNK'}</span>;
const Src = ({ u }: { u?: string }) => (u ? <a className="src" href={u} target="_blank" rel="noreferrer noopener"> [src]</a> : null);
const Facts = ({ items }: { items?: Fact[] }) => (
  <ul>{(items ?? []).slice(0, 4).map((f, i) => <li key={i}><Tag s={f.status} /><strong>{f.label}:</strong> {f.value}<Src u={f.sourceUrl} /></li>)}{!items?.length && <li>Not available</li>}</ul>
);

export default function BriefView({ briefId }: { briefId: string }) {
  const [data, setData] = useState<{ brief: Brief; run?: Run; funder?: Funder } | null>(null);
  const [err, setErr] = useState('');
  const [override, setOverride] = useState('');
  const load = () => api<{ brief: Brief; run?: Run; funder?: Funder }>(`briefs/${briefId}`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [briefId]);

  if (!data) return <>{err ? <div className="err">{err}</div> : <p className="muted">Loading…</p>}</>;
  const { brief, run, funder } = data;
  const fit = run?.fit;
  const rec = fit?.recommendation;
  const recCls = rec === 'Pursue' ? 'green' : rec === 'Cultivate' ? 'amber' : 'red';
  const locked = brief.state === 'approved';

  async function save(p: Partial<Brief> & { resolvedItems?: string[]; overrideNote?: string }) {
    setErr('');
    try { await patch(`briefs/${brief.id}`, p); load(); } catch (e) { setErr((e as Error).message); }
  }
  async function rerun() {
    if (!funder) return;
    const r = await post<{ id: string }>('runs', { funderId: funder.id });
    location.hash = `#/run/${r.id}`;
  }
  function copyText() {
    const t = [`${funder?.name} — ${rec} (${fit?.total}/100)`, brief.headline, '', ...brief.narrative.map((n) => `${n.title}\n${n.body}\n`)].join('\n');
    navigator.clipboard?.writeText(t);
  }

  return (
    <>
      <div className="row noprint" style={{ marginBottom: 8 }}>
        <span className={`pill ${brief.state === 'approved' ? 'green' : brief.state === 'reviewed' ? 'blue' : 'amber'}`}>{brief.state.toUpperCase()} · v{brief.version}</span>
        <div className="grow" />
        <button className="btn alt" onClick={rerun}>Re-run research</button>
        <button className="btn alt" onClick={copyText}>Copy text</button>
        <button className="btn alt" onClick={() => window.print()}>Print / Save PDF</button>
      </div>
      {err && <div className="err">{err}</div>}

      <article className="brief">
        <div className="hd">
          <div><h2>{funder?.name}</h2><div className="muted">{funder?.type} · {run?.intelligence?.websiteUrl && <a href={run.intelligence.websiteUrl} target="_blank" rel="noreferrer noopener">{run.intelligence.websiteUrl}</a>} {funder?.ein && `· EIN ${funder.ein}`}</div></div>
          <div className="muted" style={{ textAlign: 'right' }}>Funder brief for The Aimsir Foundation<br />Generated {new Date(brief.createdAt).toLocaleDateString()} · DRAFT until approved</div>
        </div>

        <div className={`panel ${recCls}`}>
          <div className="row"><div className="score">{fit?.total ?? '—'}</div><div className="grow"><h4>Recommendation: {rec ?? 'Not scored'}</h4>
            <textarea className="noprint" rows={2} style={{ minHeight: 0 }} value={brief.headline} disabled={locked} onChange={(e) => setData({ ...data, brief: { ...brief, headline: e.target.value } })} onBlur={(e) => save({ headline: e.target.value })} />
            <div className="printonly" style={{ fontWeight: 600 }}>{brief.headline}</div></div></div>
          {fit?.flags.length ? <ul>{fit.flags.map((f) => <li key={f}>{f}</li>)}</ul> : null}
        </div>

        <div className="grid2">
          <div className="panel blue"><h4>Priorities & eligibility</h4><p style={{ margin: '0 0 4px' }}>{run?.intelligence?.summary}</p><Facts items={run?.intelligence?.priorities} /><Facts items={run?.intelligence?.eligibility} />
            {run?.intelligence?.possiblePriorityShift && <p><strong>Possible shift (social signal):</strong> {run.intelligence.possiblePriorityShift}</p>}</div>
          <div className="panel amber"><h4>Deadlines</h4>
            <ul>{(run?.deadlines?.deadlines ?? []).slice(0, 6).map((d, i) => <li key={i}><Tag s={d.status} />{d.label} — {d.date ? <DeadlineBadge iso={d.date} /> : 'no date'}<Src u={d.sourceUrl} /></li>)}{!run?.deadlines?.deadlines.length && <li>Unconfirmed: verify with funder</li>}</ul>
            <div className="muted">{run?.deadlines?.note}</div></div>
          <div className="panel teal"><h4>Past awards</h4>
            {run?.awards && run.awards.stats.count > 0 ? <>
              <div>{run.awards.stats.count} found · median {money(run.awards.stats.median)} · range {money(run.awards.stats.min)}–{money(run.awards.stats.max)}</div>
              <ul>{run.awards.awards.slice(0, 5).map((a, i) => <li key={i}>{a.recipient} {a.amount ? money(a.amount) : ''} {a.year ?? ''}<Src u={a.sourceUrl} /></li>)}</ul></> : <div>None found in available sources.</div>}
            <div className="muted">{run?.awards?.coverageNote}</div></div>
          <div className="panel purple"><h4>Fit rationale</h4>
            <ul>{(fit?.criteria ?? []).map((c) => <li key={c.id}><strong>{c.label}</strong> {c.score}/10 (wt {c.weight}) — {c.rationale}</li>)}</ul>
            {fit?.matchedPrograms.length ? <div><strong>Best-fit programs:</strong> {fit.matchedPrograms.join(', ')}</div> : null}</div>
        </div>

        <div className="panel" style={{ marginTop: 10 }}><h4>First-draft narrative (excerpts · edit below)</h4>
          <div className="narr">{brief.narrative.slice(0, 2).map((n) => <div key={n.id}><h5>{n.title}</h5><p>{n.body}</p></div>)}</div></div>

        <div className={`panel ${brief.openItems.length ? 'red' : 'green'}`} style={{ marginTop: 10 }}><h4>Verify before approval ({brief.openItems.length})</h4>
          <ul>{brief.openItems.map((i) => <li key={i}>{i} <button className="btn alt noprint" disabled={locked} onClick={() => save({ resolvedItems: [i] })}>Resolved</button></li>)}{!brief.openItems.length && <li>None outstanding</li>}</ul></div>
        {run?.logs.some((l) => !l.ok) && (
          <div className="panel red noprint" style={{ marginTop: 10 }}><h4>Agent errors (technical)</h4>
            <ul>{run.logs.filter((l) => !l.ok).map((l) => <li key={l.agent}><strong>{l.agent}:</strong> {l.note ?? 'unknown error'}</li>)}</ul></div>
        )}
        <div className="muted" style={{ marginTop: 6 }}>CONF = cites a source seen by the agent · INFER = judgment, verify · UNK = not found. Sources: {run?.creditsUsed.scrapeCreators ?? 0} search credits, {run?.creditsUsed.claudeCalls ?? 0} model calls.</div>
      </article>

      <section className="card noprint" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Edit full narrative drafts</h3>
        {brief.narrative.map((n, idx) => (
          <div key={n.id} style={{ marginBottom: 10 }}>
            <strong>{n.title}</strong>
            <textarea disabled={locked} value={n.body} onChange={(e) => { const next = brief.narrative.slice(); next[idx] = { ...n, body: e.target.value }; setData({ ...data, brief: { ...brief, narrative: next } }); }} onBlur={() => save({ narrative: brief.narrative })} />
            {n.needsData.length > 0 && <div className="muted">Needs: {n.needsData.join('; ')}</div>}
          </div>
        ))}
      </section>

      <section className="card noprint" style={{ marginTop: 14 }}>
        <h3 style={{ marginTop: 0 }}>Review gate</h3>
        <p className="muted">Approval is the only way a brief becomes exportable. Nothing is sent anywhere by this app.</p>
        {brief.openItems.length > 0 && !locked && <input type="text" placeholder="Override note (required to approve with open items)" value={override} onChange={(e) => setOverride(e.target.value)} />}
        <p className="row">
          <button className="btn alt" disabled={locked || brief.state === 'reviewed'} onClick={() => save({ state: 'reviewed' })}>Mark reviewed</button>
          <button className="btn" disabled={locked} onClick={() => save({ state: 'approved', overrideNote: override })}>Approve</button>
          {locked && <button className="btn alt" onClick={() => save({ state: 'draft' })}>Reopen</button>}
        </p>
        {brief.overrideNote && <div className="note">Approved with override: {brief.overrideNote}</div>}
      </section>
    </>
  );
}

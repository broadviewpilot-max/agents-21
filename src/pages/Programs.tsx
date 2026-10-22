import { useEffect, useState } from 'react';
import type { Program, ScoringConfig } from '../../shared/types.ts';
import { api, put } from '../api.ts';

export default function Programs() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [cfg, setCfg] = useState<ScoringConfig | null>(null);
  const [msg, setMsg] = useState(''); const [err, setErr] = useState('');
  useEffect(() => {
    api<Program[]>('programs').then(setPrograms).catch((e) => setErr(e.message));
    api<ScoringConfig>('scoring').then(setCfg).catch((e) => setErr(e.message));
  }, []);

  const upd = (i: number, p: Partial<Program>) => setPrograms(programs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const sum = cfg?.criteria.reduce((s, c) => s + c.weight, 0) ?? 0;

  async function savePrograms() { setErr(''); try { await put('programs', programs); setMsg('Programs saved.'); } catch (e) { setErr((e as Error).message); } }
  async function saveCfg() { setErr(''); try { await put('scoring', cfg); setMsg('Scoring weights saved.'); } catch (e) { setErr((e as Error).message); } }
  const add = () => setPrograms([...programs, { id: `prog-${Date.now().toString(36)}`, name: 'New program', status: 'draft', summary: '', audience: '', geography: '', keywords: [], sources: [] }]);

  return (
    <>
      <h2>Aimsir programs</h2>
      <div className="note">DRAFT list researched from Aimsir's public website and Instagram. Confirm or correct each program: the Fit and Narrative agents use exactly this list. No participant counts or budgets are included because none could be verified.</div>
      {err && <div className="err">{err}</div>}{msg && <div className="note">{msg}</div>}
      {programs.map((p, i) => (
        <div className="card" key={p.id} style={{ marginBottom: 10 }}>
          <div className="row">
            <input className="grow" type="text" value={p.name} onChange={(e) => upd(i, { name: e.target.value })} />
            <select value={p.status} onChange={(e) => upd(i, { status: e.target.value as Program['status'] })}><option value="draft">draft (unconfirmed)</option><option value="confirmed">confirmed by Sean</option></select>
            <button className="btn alt" onClick={() => setPrograms(programs.filter((_, j) => j !== i))}>Remove</button>
          </div>
          <textarea value={p.summary} onChange={(e) => upd(i, { summary: e.target.value })} />
          <div className="row">
            <div className="grow"><label className="muted">Audience</label><input type="text" value={p.audience} onChange={(e) => upd(i, { audience: e.target.value })} /></div>
            <div className="grow"><label className="muted">Geography</label><input type="text" value={p.geography} onChange={(e) => upd(i, { geography: e.target.value })} /></div>
          </div>
          <label className="muted">Keywords (comma-separated)</label>
          <input type="text" value={p.keywords.join(', ')} onChange={(e) => upd(i, { keywords: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />
          <div className="muted">Sources: {p.sources.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer noopener">{new URL(s).hostname}</a>).reduce<React.ReactNode[]>((a, x) => [...a, ' · ', x], []).slice(1)}</div>
        </div>
      ))}
      <p className="row"><button className="btn alt" onClick={add}>Add program</button><button className="btn" onClick={savePrograms}>Save programs</button></p>

      <h2>Fit-score weights</h2>
      <p className="muted">Planning-assumption weights. Each criterion is scored 0–10 by the Fit agent from evidence; the total is computed in code. Weights must sum to 100 (now {sum}).</p>
      {cfg && <div className="card">
        <table><tbody>{cfg.criteria.map((c, i) => (
          <tr key={c.id}><td>{c.label}<div className="muted">{c.guide}</div></td><td style={{ width: 90 }}><input type="number" min={0} max={100} value={c.weight} onChange={(e) => setCfg({ ...cfg, criteria: cfg.criteria.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)) })} /></td></tr>
        ))}</tbody></table>
        <div className="row" style={{ marginTop: 8 }}>
          <span>Pursue ≥</span><input style={{ width: 80 }} type="number" value={cfg.thresholds.pursue} onChange={(e) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, pursue: Number(e.target.value) } })} />
          <span>Cultivate ≥</span><input style={{ width: 80 }} type="number" value={cfg.thresholds.cultivate} onChange={(e) => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, cultivate: Number(e.target.value) } })} />
          <button className="btn" disabled={sum !== 100} onClick={saveCfg}>Save weights</button>
        </div>
      </div>}
    </>
  );
}

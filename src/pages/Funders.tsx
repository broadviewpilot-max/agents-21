import { Fragment, useEffect, useState } from 'react';
import type { Funder, FunderType } from '../../shared/types.ts';
import { api, patch, post } from '../api.ts';

const TYPES: FunderType[] = ['private-foundation', 'corporate', 'federal', 'public-charity', 'community-foundation', 'state-local', 'other'];

export default function Funders() {
  const [funders, setFunders] = useState<Funder[]>([]);
  const [name, setName] = useState(''); const [type, setType] = useState<FunderType>('private-foundation');
  const [url, setUrl] = useState(''); const [ein, setEin] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [eUrl, setEUrl] = useState(''); const [eEin, setEEin] = useState('');
  const load = () => api<Funder[]>('funders').then(setFunders).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try { await post('funders', { name, type, url, ein }); setName(''); setUrl(''); setEin(''); load(); } catch (x) { setErr((x as Error).message); }
  }
  async function seed() { setBusy(true); try { await post('funders/seed'); load(); } catch (x) { setErr((x as Error).message); } setBusy(false); }
  async function run(f: Funder) {
    setErr('');
    try { const r = await post<{ id: string }>('runs', { funderId: f.id }); location.hash = `#/run/${r.id}`; } catch (x) { setErr((x as Error).message); }
  }
  function startEdit(f: Funder) { setEditId(f.id); setEUrl(f.url ?? ''); setEEin(f.ein ?? ''); setErr(''); }
  async function saveEdit(f: Funder) {
    setErr('');
    try { await patch(`funders/${f.id}`, { url: eUrl, ein: eEin }); setEditId(null); load(); } catch (x) { setErr((x as Error).message); }
  }
  async function remove(f: Funder) {
    if (!confirm(`Delete ${f.name}? Its briefs stay stored but it leaves the pipeline.`)) return;
    await api(`funders/${f.id}`, { method: 'DELETE' }); load();
  }

  return (
    <>
      <h2>Funders</h2>
      {err && <div className="err">{err}</div>}
      <form className="card row" onSubmit={add}>
        <div className="grow"><label className="muted">Funder name</label><input type="text" required value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="muted">Type</label><select value={type} onChange={(e) => setType(e.target.value as FunderType)}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select></div>
        <div className="grow"><label className="muted">Website (optional)</label><input type="text" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" /></div>
        <div><label className="muted">EIN (optional)</label><input type="text" value={ein} onChange={(e) => setEin(e.target.value)} placeholder="12-3456789" /></div>
        <button className="btn" type="submit">Add funder</button>
      </form>
      <p><button className="btn alt" disabled={busy} onClick={seed}>Load starter test set (5 funders)</button> <span className="muted">Candidates to evaluate, not verified fits.</span></p>
      <div className="card"><table>
        <thead><tr><th>Funder</th><th>Type</th><th>Stage</th><th>Fit</th><th></th></tr></thead>
        <tbody>{funders.map((f) => (
          <Fragment key={f.id}>
          <tr>
            <td>{f.briefId ? <a href={`#/brief/${f.briefId}`}>{f.name}</a> : f.name}<div className="muted">{f.url ? f.url.replace(/^https?:\/\//, '').slice(0, 48) : 'no website'} · {f.ein ? `EIN ${f.ein}` : 'no EIN'}</div></td><td>{f.type}</td><td>{f.stage}</td>
            <td>{f.fitTotal !== undefined ? `${f.fitTotal} · ${f.recommendation}` : '—'}</td>
            <td className="row"><button className="btn" onClick={() => run(f)}>{f.briefId ? 'Re-run research' : 'Run research'}</button><button className="btn alt" onClick={() => (editId === f.id ? setEditId(null) : startEdit(f))}>Edit details</button><button className="btn alt" onClick={() => remove(f)}>Delete</button></td>
          </tr>
          {editId === f.id && (
            <tr><td colSpan={5}>
              <div className="row">
                <div className="grow"><label className="muted">Official website (the funder's own site)</label><input type="text" value={eUrl} onChange={(e) => setEUrl(e.target.value)} placeholder="https://" /></div>
                <div><label className="muted">EIN</label><input type="text" value={eEin} onChange={(e) => setEEin(e.target.value)} placeholder="12-3456789" /></div>
                <button className="btn" onClick={() => saveEdit(f)}>Save</button>
                <button className="btn alt" onClick={() => setEditId(null)}>Cancel</button>
              </div>
              <div className="muted">Saved values are used on the next research run, so click Re-run research after saving. Leave a field empty to clear it.</div>
            </td></tr>
          )}
          </Fragment>
        ))}</tbody>
      </table></div>
      <p className="muted">A run takes a few minutes and uses a handful of Scrape Creators credits (capped per run).</p>
    </>
  );
}

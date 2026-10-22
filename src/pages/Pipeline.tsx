import { useEffect, useState } from 'react';
import type { Funder, Stage } from '../../shared/types.ts';
import { api, daysUntil, downloadIcs, patch } from '../api.ts';

const COLS: { id: Stage; label: string }[] = [
  { id: 'researching', label: 'Researching' }, { id: 'brief-ready', label: 'Brief ready' }, { id: 'approved', label: 'Approved' },
  { id: 'drafting', label: 'Drafting' }, { id: 'submitted', label: 'Submitted (manual)' }, { id: 'awarded', label: 'Awarded' }, { id: 'declined', label: 'Declined' },
];

export function DeadlineBadge({ iso }: { iso?: string }) {
  const d = daysUntil(iso);
  if (d === undefined) return <span className="pill gray">No confirmed date</span>;
  const cls = d < 0 ? 'gray' : d <= 7 ? 'red' : d <= 30 ? 'amber' : 'green';
  return <span className={`pill ${cls}`}>{iso} · {d < 0 ? 'passed' : `${d}d`}</span>;
}

export const recPill = (r?: string) => r ? <span className={`pill ${r === 'Pursue' ? 'green' : r === 'Cultivate' ? 'amber' : 'red'}`}>{r}</span> : null;

export default function Pipeline() {
  const [funders, setFunders] = useState<Funder[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => api<Funder[]>('funders').then(setFunders).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, []);

  async function move(f: Funder, stage: Stage) {
    try { await patch(`funders/${f.id}`, { stage }); load(); } catch (e) { setErr((e as Error).message); }
  }
  const upcoming = (funders ?? []).filter((f) => f.nextDeadline).sort((a, b) => a.nextDeadline!.localeCompare(b.nextDeadline!));

  return (
    <>
      <div className="row"><h2 className="grow">Deadline pipeline</h2>
        <button className="btn alt" onClick={() => downloadIcs().catch((e) => setErr(e.message))} title="Downloads a calendar file you can open in Google/Apple/Outlook Calendar">Download calendar (.ics)</button>
      </div>
      {err && <div className="err">{err}</div>}
      {funders && funders.length === 0 && <div className="note">No funders yet. Go to <a href="#/funders">Funders</a> to add one or load the starter test set.</div>}
      {upcoming.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <strong>Next deadlines</strong>
          <table><tbody>{upcoming.slice(0, 6).map((f) => (
            <tr key={f.id}><td><a href={f.briefId ? `#/brief/${f.briefId}` : '#/funders'}>{f.name}</a></td><td><DeadlineBadge iso={f.nextDeadline} /></td><td>{recPill(f.recommendation)}</td></tr>
          ))}</tbody></table>
        </div>
      )}
      <div className="board">
        {COLS.map((c) => (
          <div className="col" key={c.id}>
            <h3>{c.label}</h3>
            {(funders ?? []).filter((f) => f.stage === c.id).map((f) => (
              <div className="card" key={f.id}>
                <div><a href={f.briefId ? `#/brief/${f.briefId}` : '#/funders'}><strong>{f.name}</strong></a></div>
                <div className="row" style={{ margin: '4px 0' }}>{recPill(f.recommendation)}{f.fitTotal !== undefined && <span className="muted">{f.fitTotal}/100</span>}</div>
                <DeadlineBadge iso={f.nextDeadline} />
                <select aria-label="Move stage" style={{ marginTop: 6 }} value={f.stage} onChange={(e) => move(f, e.target.value as Stage)}>
                  {COLS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="muted">"Submitted" is a manual marker you set yourself. This app never contacts a funder.</p>
    </>
  );
}

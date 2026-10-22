import { useEffect, useState } from 'react';
import type { Funder, Run } from '../../shared/types.ts';
import { api } from '../api.ts';

const AGENTS = ['Funder Intelligence Analyst', 'Awards & 990 Analyst', 'Deadline & Pipeline Strategist', 'Fit Scoring Analyst', 'Narrative Drafter', 'Brief Editor'];

export default function RunView({ runId }: { runId: string }) {
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let stop = false;
    async function tick() {
      try {
        const r = await api<Run>(`runs/${runId}`);
        if (stop) return;
        setRun(r);
        if (r.status === 'done') {
          const fs = await api<Funder[]>('funders');
          const f = fs.find((x) => x.id === r.funderId);
          if (f?.briefId) { location.hash = `#/brief/${f.briefId}`; return; }
        }
        if (r.status !== 'failed' && r.status !== 'done') setTimeout(tick, 3000);
      } catch (e) { setErr((e as Error).message); }
    }
    tick();
    return () => { stop = true; };
  }, [runId]);

  return (
    <>
      <h2>Research run</h2>
      {err && <div className="err">{err}</div>}
      {run && <p className="muted">Status: <strong>{run.status}</strong> · Scrape Creators credits {run.creditsUsed.scrapeCreators} · Firecrawl calls {run.creditsUsed.firecrawl} · Claude calls {run.creditsUsed.claudeCalls}</p>}
      <div className="card"><table><tbody>
        {AGENTS.map((a) => {
          const l = run?.logs.find((x) => x.agent === a);
          return <tr key={a}><td>{a}</td><td>{l ? (l.ok ? <span className="pill green">done {(l.ms / 1000).toFixed(1)}s</span> : <span className="pill red">failed</span>) : <span className="pill gray">{run?.status === 'running' ? 'waiting' : 'queued'}</span>}</td><td className="muted">{l?.note}</td></tr>;
        })}
      </tbody></table></div>
      {run?.status === 'failed' && <div className="err">Run failed: {run.error}</div>}
      <p className="muted">You will be taken to the brief when it is ready. You can leave this page; the run continues on the server.</p>
    </>
  );
}

import { useEffect, useState } from 'react';
import { api, post, put } from '../api.ts';

interface Health { open: boolean; access: string; accountEmail?: string; scrapeCreatorsKey: boolean; scrapeCreatorsCredits: number | null; anthropicKey: boolean; firecrawlKey: boolean; geminiKey: boolean; geminiModel: string; model: string; scCreditCapPerRun: number }

export default function Settings() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState('');
  const [claudeTest, setClaudeTest] = useState('');
  const [gRows, setGRows] = useState<{ model: string; ok: boolean; ms?: number; error?: string }[]>([]);
  const [gBusy, setGBusy] = useState(false);
  const [gMsg, setGMsg] = useState('');
  const [gCurrent, setGCurrent] = useState('');

  async function testGemini() {
    setGBusy(true); setGRows([]); setGMsg('Looking up available Gemini models…');
    try {
      const { models, current, error } = await api<{ models: string[]; current: string; error?: string }>('health/gemini-models');
      setGCurrent(current);
      if (error) { setGMsg(error); setGBusy(false); return; }
      const order = [current, ...models.filter((m) => m !== current)].slice(0, 5);
      setGMsg(`Testing up to ${order.length} model(s), one at a time…`);
      for (const m of order) {
        const r = await post<{ ok: boolean; ms?: number; error?: string }>('health/gemini', { model: m }).catch((e: Error) => ({ ok: false, error: e.message || 'No response' }) as { ok: boolean; ms?: number; error?: string });
        setGRows((prev) => [...prev, { model: m, ...r }]);
        if (r.ok) break;
      }
      setGMsg('Done. Pick a working model with "Use this model" if it is not the current one.');
    } catch (e) { setGMsg((e as Error).message || 'No response from the server. Try again.'); }
    setGBusy(false);
  }
  async function useModel(m: string) {
    try { await put('health/gemini-model', { model: m }); setGCurrent(m); setGMsg(`Now using ${m}. Re-run research to apply it.`); setH((h0) => (h0 ? { ...h0, geminiModel: m } : h0)); } catch (e) { setGMsg((e as Error).message); }
  }
  useEffect(() => { api<Health>('health').then(setH).catch((e) => setErr(e.message)); }, []);
  const row = (label: string, ok: boolean, detail?: string, fix?: string) => (
    <tr><td>{label}</td><td><span className={`pill ${ok ? 'green' : 'red'}`}>{ok ? 'connected' : 'missing'}</span></td><td className="muted">{ok ? detail : fix}</td></tr>
  );
  return (
    <>
      <h2>Connections</h2>
      {err && <div className="err">{err}</div>}
      {h && <div className="card"><table><tbody>
        {row('Scrape Creators', h.scrapeCreatorsKey, h.scrapeCreatorsCredits !== null ? `${h.scrapeCreatorsCredits} credits remaining · cap ${h.scCreditCapPerRun}/run` : 'key set; balance check failed', 'Set SCRAPECREATORS_API_KEY in Netlify environment variables.')}
        {row('Anthropic (Claude)', h.anthropicKey, `model ${h.model}`, 'Required for the agents. Create a key at platform.claude.com/settings/keys and set ANTHROPIC_API_KEY.')}
        {row('Google Gemini (verifier)', h.geminiKey, `model ${h.geminiModel}`, 'Optional but recommended. Create a key at aistudio.google.com and set GEMINI_API_KEY in Netlify. Without it, no second-model check runs.')}
        {row('Firecrawl', h.firecrawlKey, 'page reading via Firecrawl', 'Optional. Without it, pages are read with a plain fetch (weaker on JavaScript-heavy sites).')}
        <tr><td>Access</td><td><span className={`pill ${h.open ? 'amber' : 'green'}`}>{h.access}</span></td><td className="muted">{h.open ? 'Temporary: anyone with the URL can use the app. Set GOOGLE_CLIENT_ID + ALLOWED_EMAILS (or APP_PASSWORD) in Netlify to lock it.' : h.accountEmail ? `Signed in as ${h.accountEmail}.` : h.access.includes('google') ? 'Social sign-in (Google / Facebook) is on. You are signed in with the backup password.' : 'Password gate active.'}</td></tr>
      </tbody></table></div>}
      <p className="row"><button className="btn alt" onClick={async () => { setClaudeTest('Testing…'); try { const r = await post<{ ok: boolean; error?: string }>('health/claude'); setClaudeTest(r.ok ? 'Claude responded: working.' : `Claude call failed: ${r.error}`); } catch (e) { setClaudeTest((e as Error).message || 'No response from the server. Try again.'); } }}>Test Claude</button></p>
      <p className="row"><button className="btn alt" disabled={gBusy} onClick={testGemini}>Test Gemini</button></p>
      {gMsg && <div className="note">{gMsg}</div>}
      {gRows.length > 0 && <div className="card"><table><tbody>{gRows.map((r) => (
        <tr key={r.model}><td>{r.model}{r.model === gCurrent && <span className="muted"> (current)</span>}</td>
          <td><span className={`pill ${r.ok ? 'green' : 'red'}`}>{r.ok ? `working · ${((r.ms ?? 0) / 1000).toFixed(1)}s` : 'failed'}</span></td>
          <td className="muted">{r.ok ? (r.model !== gCurrent ? <button className="btn" onClick={() => useModel(r.model)}>Use this model</button> : 'in use') : r.error}</td></tr>
      ))}</tbody></table></div>}
      {claudeTest && <div className={claudeTest.startsWith('Claude responded') ? 'note' : 'err'}>{claudeTest}</div>}
      <p className="muted">Keys live only in Netlify environment variables and are used server-side. They are never sent to the browser.</p>
    </>
  );
}

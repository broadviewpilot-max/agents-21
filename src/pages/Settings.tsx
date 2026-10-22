import { useEffect, useState } from 'react';
import { api } from '../api.ts';

interface Health { appPassword: boolean; scrapeCreatorsKey: boolean; scrapeCreatorsCredits: number | null; anthropicKey: boolean; firecrawlKey: boolean; model: string; scCreditCapPerRun: number }

export default function Settings() {
  const [h, setH] = useState<Health | null>(null);
  const [err, setErr] = useState('');
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
        {row('Firecrawl', h.firecrawlKey, 'page reading via Firecrawl', 'Optional. Without it, pages are read with a plain fetch (weaker on JavaScript-heavy sites).')}
        {row('App password', h.appPassword, 'gate active', 'Set APP_PASSWORD or nobody can sign in.')}
      </tbody></table></div>}
      <p className="muted">Keys live only in Netlify environment variables and are used server-side. They are never sent to the browser.</p>
    </>
  );
}

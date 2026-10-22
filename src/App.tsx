import { useEffect, useState } from 'react';
import { api, setPw, getPw } from './api.ts';
import Pipeline from './pages/Pipeline.tsx';
import Funders from './pages/Funders.tsx';
import RunView from './pages/RunView.tsx';
import BriefView from './pages/BriefView.tsx';
import Programs from './pages/Programs.tsx';
import Settings from './pages/Settings.tsx';

const useHash = () => {
  const [h, setH] = useState(location.hash || '#/');
  useEffect(() => { const f = () => setH(location.hash || '#/'); addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, []);
  return h.replace(/^#/, '');
};

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setLocal] = useState('');
  const [err, setErr] = useState('');
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setPw(pw);
    try { await api('session'); onOk(); } catch { setPw(''); setErr('Incorrect password.'); }
  }
  return (
    <form className="card login" onSubmit={go}>
      <h2>Aimsir Funder Command Center</h2>
      <p className="muted">Private workspace. Nothing here sends or submits anything.</p>
      <input type="password" autoFocus placeholder="Password" value={pw} onChange={(e) => setLocal(e.target.value)} />
      {err && <div className="err">{err}</div>}
      <p><button className="btn" type="submit">Enter</button></p>
    </form>
  );
}

export default function App() {
  const [authed, setAuthed] = useState(false);
  const [checked, setChecked] = useState(false);
  const [open, setOpen] = useState(false);
  const route = useHash();

  useEffect(() => {
    api<{ open: boolean }>('session').then((r) => { setOpen(r.open); setAuthed(true); }).catch(() => setPw('')).finally(() => setChecked(true));
  }, []);

  if (!checked) return null;
  if (!authed) return <main><Login onOk={() => setAuthed(true)} /></main>;

  const parts = route.split('/').filter(Boolean);
  const [page, id] = parts;
  const nav = (to: string, label: string, on: boolean) => <a key={to} href={`#/${to}`} className={on ? 'on' : ''}>{label}</a>;

  return (
    <>
      <header className="top">
        <h1>AIMSIR FUNDER COMMAND CENTER</h1>
        <nav>
          {nav('', 'Pipeline', !page)}
          {nav('funders', 'Funders', page === 'funders')}
          {nav('programs', 'Programs & Scoring', page === 'programs')}
          {nav('settings', 'Settings', page === 'settings')}
        </nav>
        <a href="#/" style={{ color: '#dbe7f6' }} onClick={() => { setPw(''); setAuthed(false); }}>Sign out</a>
      </header>
      {open && <div className="note" style={{ margin: 0, borderRadius: 0, textAlign: 'center' }}>Open mode: no password is set, so anyone with this URL can use the app and spend your API credits. Set <code>APP_PASSWORD</code> in Netlify to lock it.</div>}
      <main>
        {!page && <Pipeline />}
        {page === 'funders' && <Funders />}
        {page === 'run' && id && <RunView runId={id} />}
        {page === 'brief' && id && <BriefView briefId={id} />}
        {page === 'programs' && <Programs />}
        {page === 'settings' && <Settings />}
      </main>
    </>
  );
}

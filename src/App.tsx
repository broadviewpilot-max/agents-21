import { useEffect, useRef, useState } from 'react';
import { api, post, setPw, setToken } from './api.ts';
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

interface AuthConfig { mode: 'open' | 'password' | 'google' | 'google+password'; googleClientId?: string; googleReady: boolean }
declare global { interface Window { google?: { accounts: { id: { initialize: (o: unknown) => void; renderButton: (el: HTMLElement, o: unknown) => void; disableAutoSelect?: () => void } } } } }

function GoogleButton({ clientId, onCredential }: { clientId: string; onCredential: (c: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const init = () => {
      const g = window.google?.accounts.id;
      if (!g || !ref.current) return;
      g.initialize({ client_id: clientId, callback: (r: { credential: string }) => onCredential(r.credential), auto_select: false });
      g.renderButton(ref.current, { theme: 'outline', size: 'large', text: 'signin_with', width: 280 });
    };
    if (window.google?.accounts.id) { init(); return; }
    const tag = document.createElement('script');
    tag.src = 'https://accounts.google.com/gsi/client';
    tag.async = true;
    tag.onload = init;
    document.head.appendChild(tag);
  }, [clientId]);
  return <div ref={ref} style={{ minHeight: 44 }} />;
}

function Login({ onOk }: { onOk: () => void }) {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [pw, setLocal] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => { fetch('/api/config').then((r) => r.json()).then(setCfg).catch(() => setErr('Could not reach the server.')); }, []);

  async function withPassword(e: React.FormEvent) {
    e.preventDefault();
    setPw(pw);
    try { await api('session'); onOk(); } catch { setPw(''); setErr('Incorrect password.'); }
  }
  async function withGoogle(credential: string) {
    setErr('');
    try {
      const r = await post<{ token: string }>('auth/google', { credential });
      setToken(r.token);
      onOk();
    } catch (e) { setErr((e as Error).message || 'Google sign-in failed.'); }
  }

  return (
    <div className="card login">
      <h2>Aimsir Funder Command Center</h2>
      <p className="muted">Private workspace. Nothing here sends or submits anything.</p>
      {cfg?.mode.includes('google') && cfg.googleClientId && (cfg.googleReady
        ? <GoogleButton clientId={cfg.googleClientId} onCredential={withGoogle} />
        : <div className="err">Google sign-in is on, but no allowed email is set. Add ALLOWED_EMAILS in Netlify.</div>)}
      {cfg?.mode.includes('password') && (
        <form onSubmit={withPassword} style={{ marginTop: 12 }}>
          {cfg.mode.includes('google') && <p className="muted">Or use the backup password:</p>}
          <input type="password" placeholder="Password" value={pw} onChange={(e) => setLocal(e.target.value)} />
          <p><button className="btn" type="submit">Enter</button></p>
        </form>
      )}
      {err && <div className="err">{err}</div>}
    </div>
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
        <a href="#/" style={{ color: '#dbe7f6' }} onClick={() => { setPw(''); setToken(''); window.google?.accounts.id.disableAutoSelect?.(); setAuthed(false); }}>Sign out</a>
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

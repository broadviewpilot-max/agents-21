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

interface AuthConfig { mode: 'open' | 'password' | 'google' | 'google+password'; googleClientId?: string; facebook?: { url: string }; googleReady: boolean }
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

/* Facebook sign-in is brokered by Supabase: we send the browser to Supabase, Facebook asks for consent, and Supabase sends the
   browser back here with a short-lived token in the URL hash. Read it once, scrub it from the address bar, then exchange it with our
   own server (which re-verifies it and applies the allowlist). The Supabase token is never stored. */
interface OAuthReturn { accessToken?: string; error?: string }
function takeOAuthReturn(): OAuthReturn | null {
  const fromHash = new URLSearchParams(location.hash.replace(/^#/, ''));
  const fromQuery = new URLSearchParams(location.search);
  const accessToken = fromHash.get('access_token') ?? undefined;
  const error = fromHash.get('error_description') ?? fromQuery.get('error_description') ?? fromHash.get('error') ?? fromQuery.get('error') ?? undefined;
  if (!accessToken && !error) return null;
  history.replaceState(null, '', `${location.pathname}#/`);
  return { accessToken, error: error?.replace(/\+/g, ' ') };
}
const oauthReturn = takeOAuthReturn();

function startFacebook(supabaseUrl: string) {
  const redirect = encodeURIComponent(`${location.origin}/`);
  location.assign(`${supabaseUrl}/auth/v1/authorize?provider=facebook&scopes=email&redirect_to=${redirect}`);
}

function Login({ onOk }: { onOk: () => void }) {
  const [cfg, setCfg] = useState<AuthConfig | null>(null);
  const [pw, setLocal] = useState('');
  const [err, setErr] = useState('');
  const exchanged = useRef(false);
  useEffect(() => { fetch('/api/config').then((r) => r.json()).then(setCfg).catch(() => setErr('Could not reach the server.')); }, []);
  useEffect(() => {
    if (exchanged.current || !oauthReturn) return;
    exchanged.current = true;
    if (oauthReturn.accessToken) {
      post<{ token: string }>('auth/facebook', { accessToken: oauthReturn.accessToken })
        .then((r) => { setToken(r.token); onOk(); })
        .catch((e: Error) => setErr(e.message || 'Facebook sign-in failed.'));
    } else setErr(`Sign-in was not completed: ${oauthReturn.error}`);
  }, []);

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
      {cfg?.mode.includes('google') && !cfg.googleReady && <div className="err">Sign-in is on, but no allowed email is set. Add ALLOWED_EMAILS in Netlify.</div>}
      {cfg?.mode.includes('google') && cfg.googleReady && cfg.googleClientId && <GoogleButton clientId={cfg.googleClientId} onCredential={withGoogle} />}
      {cfg?.mode.includes('google') && cfg.googleReady && cfg.facebook && (
        <p style={{ margin: '12px 0 0' }}>
          <button type="button" className="btn" onClick={() => startFacebook(cfg.facebook!.url)}
            style={{ width: 280, background: '#1877F2', color: '#fff', border: 0, minHeight: 40, fontWeight: 600 }}>Continue with Facebook</button>
        </p>
      )}
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

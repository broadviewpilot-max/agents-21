import { SignJWT, generateKeyPair } from 'jose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const db = new Map<string, unknown>();
vi.mock('../netlify/lib/store.ts', () => ({
  getJson: async (s: string, k: string) => db.get(`${s}/${k}`) ?? null,
  putJson: async (s: string, k: string, v: unknown) => void db.set(`${s}/${k}`, JSON.parse(JSON.stringify(v))),
  delKey: async () => {}, listJson: async () => [],
}));

const keys = await generateKeyPair('RS256');
vi.mock('jose', async (orig) => {
  const real = await orig<typeof import('jose')>();
  return { ...real, createRemoteJWKSet: () => async () => (globalThis as unknown as { __k: CryptoKey }).__k }; // verify against our local test key
});
(globalThis as unknown as { __k: unknown }).__k = keys.publicKey;

import { accessMode, authenticate, facebookEnabled, issueSession, readSession, resetFacebookCache, verifyFacebookSession, verifyGoogleCredential } from '../netlify/lib/auth.ts';

const CLIENT = 'client-123.apps.googleusercontent.com';
const req = (h: Record<string, string> = {}) => new Request('https://x/api/funders', { headers: h });
const idToken = (o: { aud?: string; email?: string; verified?: boolean; iss?: string; exp?: string } = {}) =>
  new SignJWT({ email: o.email ?? 'sean@example.com', email_verified: o.verified ?? true })
    .setProtectedHeader({ alg: 'RS256' }).setIssuer(o.iss ?? 'https://accounts.google.com').setAudience(o.aud ?? CLIENT)
    .setIssuedAt().setExpirationTime(o.exp ?? '10m').sign(keys.privateKey);

function env(e: Record<string, string | undefined>) {
  for (const k of ['GOOGLE_CLIENT_ID', 'ALLOWED_EMAILS', 'APP_PASSWORD', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY']) delete process.env[k];
  for (const [k, v] of Object.entries(e)) if (v !== undefined) process.env[k] = v;
}

describe('access modes', () => {
  beforeEach(() => db.clear());
  afterEach(() => env({}));

  it('is open with nothing configured', async () => {
    env({});
    expect(accessMode()).toBe('open');
    expect((await authenticate(req())).ok).toBe(true);
  });
  it('enforces the password when only a password is set', async () => {
    env({ APP_PASSWORD: 'secret-pass' });
    expect(accessMode()).toBe('password');
    expect((await authenticate(req())).ok).toBe(false);
    expect((await authenticate(req({ 'x-app-password': 'wrong-pass!' }))).ok).toBe(false);
    expect((await authenticate(req({ 'x-app-password': 'secret-pass' }))).ok).toBe(true);
  });
  it('in Google-only mode ignores any password header and rejects anonymous requests', async () => {
    env({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'sean@example.com' });
    expect(accessMode()).toBe('google');
    expect((await authenticate(req())).ok).toBe(false);
    expect((await authenticate(req({ 'x-app-password': 'anything' }))).ok).toBe(false);
  });
  it('accepts a valid session for an allowed email, and the backup password in combined mode', async () => {
    env({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'sean@example.com', APP_PASSWORD: 'backup-pass' });
    expect(accessMode()).toBe('google+password');
    const { token } = await issueSession('sean@example.com');
    const a = await authenticate(req({ authorization: `Bearer ${token}` }));
    expect(a).toMatchObject({ ok: true, via: 'google', email: 'sean@example.com' });
    expect((await authenticate(req({ 'x-app-password': 'backup-pass' }))).via).toBe('password');
  });
});

describe('session tokens', () => {
  beforeEach(() => { db.clear(); env({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'sean@example.com' }); });
  afterEach(() => env({}));

  it('round-trips, and rejects tampering, expiry and removed emails', async () => {
    const { token } = await issueSession('sean@example.com');
    expect(await readSession(token)).toBe('sean@example.com');

    const [payload, sig] = token.split('.');
    const forged = Buffer.from(JSON.stringify({ email: 'attacker@example.com', exp: Date.now() + 1e9 })).toString('base64url');
    expect(await readSession(`${forged}.${sig}`)).toBeNull();
    expect(await readSession(`${payload}.AAAA`)).toBeNull();
    expect(await readSession('garbage')).toBeNull();

    expect(await readSession((await issueSession('sean@example.com', -1000)).token)).toBeNull();

    env({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'someone-else@example.com' });
    expect(await readSession(token)).toBeNull();
  });
  it('persists a random secret server-side (not derived from public values)', async () => {
    vi.resetModules(); // fresh module = empty in-memory cache, so the secret must be created and saved
    const fresh = await import('../netlify/lib/auth.ts');
    await fresh.issueSession('sean@example.com');
    const saved = db.get('config/session-secret') as { value: string };
    expect(saved.value).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('Google ID token verification', () => {
  beforeEach(() => env({ GOOGLE_CLIENT_ID: CLIENT, ALLOWED_EMAILS: 'Sean@Example.com' }));
  afterEach(() => env({}));

  it('accepts a valid token for an allowed email (case-insensitive)', async () => {
    expect(await verifyGoogleCredential(await idToken({ email: 'sean@example.com' }))).toBe('sean@example.com');
  });
  it('rejects wrong audience, unverified email, wrong issuer, expired token, and non-allowed accounts', async () => {
    await expect(verifyGoogleCredential(await idToken({ aud: 'someone-elses-client' }))).rejects.toThrow();
    await expect(verifyGoogleCredential(await idToken({ verified: false }))).rejects.toThrow(/not verified/);
    await expect(verifyGoogleCredential(await idToken({ iss: 'https://evil.example' }))).rejects.toThrow();
    await expect(verifyGoogleCredential(await idToken({ exp: '-1m' as string }))).rejects.toThrow();
    await expect(verifyGoogleCredential(await idToken({ email: 'stranger@example.com' }))).rejects.toThrow(/not on the allowed list/);
  });
  it('rejects a token signed by a different key', async () => {
    const other = await generateKeyPair('RS256');
    const bad = await new SignJWT({ email: 'sean@example.com', email_verified: true }).setProtectedHeader({ alg: 'RS256' })
      .setIssuer('https://accounts.google.com').setAudience(CLIENT).setExpirationTime('10m').sign(other.privateKey);
    await expect(verifyGoogleCredential(bad)).rejects.toThrow();
  });
});


describe('Facebook sign-in (via Supabase)', () => {
  const SB = 'https://proj.supabase.co';
  const fbUser = (o: { identityEmail?: string; confirmed?: string | null; verified?: boolean; provider?: string; primary?: string } = {}) => ({
    email: o.primary ?? 'sean@example.com',
    email_confirmed_at: o.confirmed === undefined ? '2026-11-06T00:00:00Z' : o.confirmed,
    identities: [{ provider: o.provider ?? 'facebook', identity_data: { email: o.identityEmail ?? 'sean@example.com', ...(o.verified === undefined ? {} : { email_verified: o.verified }) } }],
  });
  const stubFetch = (body: unknown, ok = true) => {
    const f = vi.fn(async () => ({ ok, status: ok ? 200 : 401, json: async () => body }) as unknown as Response);
    vi.stubGlobal('fetch', f);
    return f;
  };
  beforeEach(() => { db.clear(); resetFacebookCache(); env({ ALLOWED_EMAILS: 'sean@example.com', SUPABASE_URL: SB + '/', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' }); });
  afterEach(() => { env({}); vi.unstubAllGlobals(); });

  it('accepts an allowed, confirmed Facebook identity and asks Supabase to validate the token', async () => {
    const f = stubFetch(fbUser());
    expect(await verifyFacebookSession('tok-123')).toBe('sean@example.com');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${SB}/auth/v1/user`);
    expect(init.headers).toMatchObject({ apikey: 'sb_publishable_test', authorization: 'Bearer tok-123' });
  });
  it('lowercases the email and still matches the allowlist', async () => {
    stubFetch(fbUser({ identityEmail: 'Sean@Example.com' }));
    expect(await verifyFacebookSession('t')).toBe('sean@example.com');
  });
  it('rejects an email that is not on the allowlist', async () => {
    stubFetch(fbUser({ identityEmail: 'stranger@example.com', primary: 'stranger@example.com' }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/not on the allowed list/);
  });
  it('rejects a sign-in that has no Facebook identity (e.g. a password sign-up using an allowed address)', async () => {
    stubFetch(fbUser({ provider: 'email' }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/did not come from Facebook/);
  });
  it('trusts the Facebook identity email, not the account primary email', async () => {
    stubFetch(fbUser({ primary: 'sean@example.com', identityEmail: 'attacker@example.com' }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/not on the allowed list/);
  });
  it('rejects unconfirmed or explicitly unverified emails', async () => {
    stubFetch(fbUser({ confirmed: null }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/not verified/);
    stubFetch(fbUser({ verified: false }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/not verified/);
  });
  it('rejects when Facebook shares no email', async () => {
    stubFetch(fbUser({ identityEmail: '' }));
    await expect(verifyFacebookSession('t')).rejects.toThrow(/did not share an email/);
  });
  it('rejects tokens Supabase refuses, and when not configured', async () => {
    stubFetch({ msg: 'invalid JWT' }, false);
    await expect(verifyFacebookSession('bad')).rejects.toThrow(/could not be verified/);
    env({ ALLOWED_EMAILS: 'sean@example.com' });
    await expect(verifyFacebookSession('t')).rejects.toThrow(/not configured/);
  });
  it('facebook-only configuration is never "open": anonymous requests are rejected', async () => {
    expect(accessMode()).toBe('google');
    expect((await authenticate(req())).ok).toBe(false);
    const { token } = await issueSession('sean@example.com');
    expect((await authenticate(req({ authorization: `Bearer ${token}` }))).ok).toBe(true);
  });
  it('shows the Facebook button only when Supabase reports the provider enabled, and fails closed', async () => {
    stubFetch({ external: { facebook: true } });
    expect(await facebookEnabled()).toBe(true);
    resetFacebookCache(); stubFetch({ external: { facebook: false } });
    expect(await facebookEnabled()).toBe(false);
    resetFacebookCache(); vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    expect(await facebookEnabled()).toBe(false);
    env({}); resetFacebookCache();
    expect(await facebookEnabled()).toBe(false);
  });
});

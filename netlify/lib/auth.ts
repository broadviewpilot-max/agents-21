import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { getJson, putJson } from './store.ts';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
const SESSION_MS = 12 * 60 * 60 * 1000;

// 'google' means "social sign-in is on" (Google and/or Facebook). Either one makes the site non-open and requires ALLOWED_EMAILS.
export type AccessMode = 'open' | 'password' | 'google' | 'google+password';

export const googleClientId = () => process.env.GOOGLE_CLIENT_ID?.trim() || '';

/** Supabase project used for Facebook sign-in. Both values are public by design (never put a service-role key here). */
export function supabaseConfig(): { url: string; key: string } | null {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/+$/, '');
  const key = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
  return url && key ? { url, key } : null;
}
export const facebookConfigured = () => supabaseConfig() !== null;
export const allowedEmails = () => (process.env.ALLOWED_EMAILS ?? '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);

export function accessMode(): AccessMode {
  const g = !!googleClientId() || facebookConfigured();
  const p = !!process.env.APP_PASSWORD;
  return g && p ? 'google+password' : g ? 'google' : p ? 'password' : 'open';
}

/* ---- app session token: HMAC-signed {email, exp}; secret is random, stored server-side only ---- */
let cachedSecret: string | undefined;
async function sessionSecret(): Promise<string> {
  if (cachedSecret) return cachedSecret;
  const saved = await getJson<{ value?: string }>('config', 'session-secret');
  if (saved?.value) return (cachedSecret = saved.value);
  const value = randomBytes(32).toString('hex');
  await putJson('config', 'session-secret', { value });
  return (cachedSecret = value);
}
const sign = async (payload: string) => createHmac('sha256', await sessionSecret()).update(payload).digest();

export async function issueSession(email: string, ttlMs = SESSION_MS): Promise<{ token: string; expiresAt: number }> {
  const expiresAt = Date.now() + ttlMs;
  const payload = Buffer.from(JSON.stringify({ email, exp: expiresAt })).toString('base64url');
  return { token: `${payload}.${(await sign(payload)).toString('base64url')}`, expiresAt };
}

export async function readSession(token: string): Promise<string | null> {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = await sign(payload);
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { email, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { email?: string; exp?: number };
    if (!email || typeof exp !== 'number' || exp < Date.now()) return null;
    return allowedEmails().includes(email.toLowerCase()) ? email : null; // removing an email from the allowlist revokes it
  } catch {
    return null;
  }
}

/** Verify a Google ID token (signature, issuer, audience, expiry), then require a verified email on the allowlist. */
export async function verifyGoogleCredential(credential: string): Promise<string> {
  const { payload } = await jwtVerify(credential, GOOGLE_JWKS, { issuer: ['https://accounts.google.com', 'accounts.google.com'], audience: googleClientId() });
  const email = String(payload.email ?? '').toLowerCase();
  if (payload.email_verified !== true) throw new Error('Your Google email address is not verified.');
  if (!allowedEmails().includes(email)) throw new Error(`${email || 'This Google account'} is not on the allowed list for this site.`);
  return email;
}

/* ---- Facebook sign-in, brokered by Supabase Auth ---- */
let providerCache: { at: number; facebook: boolean } | null = null;

/** Is the Facebook provider switched on in Supabase? Lets the login screen hide a button that would only error. */
export async function facebookEnabled(): Promise<boolean> {
  const cfg = supabaseConfig();
  if (!cfg) return false;
  if (providerCache && Date.now() - providerCache.at < 60_000) return providerCache.facebook;
  let facebook = false;
  try {
    const res = await fetch(`${cfg.url}/auth/v1/settings`, { headers: { apikey: cfg.key } });
    if (res.ok) facebook = ((await res.json()) as { external?: { facebook?: boolean } }).external?.facebook === true;
  } catch { /* unreachable: treat as off */ }
  providerCache = { at: Date.now(), facebook };
  return facebook;
}
export const resetFacebookCache = () => { providerCache = null; };

interface SupabaseUser {
  email?: string;
  email_confirmed_at?: string | null;
  identities?: { provider?: string; identity_data?: { email?: string; email_verified?: boolean } }[];
}

/**
 * Verify a Supabase access token from a Facebook sign-in, then apply the same email allowlist as Google.
 * Supabase itself validates the token (signature, expiry, project) when asked who it belongs to, so no signing key is needed here.
 * The email is taken from the Facebook identity, not the account's primary email, and Supabase must have confirmed it.
 * That blocks a password sign-up in the same project from claiming an allowed address.
 */
export async function verifyFacebookSession(accessToken: string): Promise<string> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('Facebook sign-in is not configured on this site.');
  const res = await fetch(`${cfg.url}/auth/v1/user`, { headers: { apikey: cfg.key, authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error('Facebook sign-in could not be verified. Please try again.');
  const user = (await res.json()) as SupabaseUser;
  const fb = user.identities?.find((i) => i.provider === 'facebook');
  const email = String(fb?.identity_data?.email ?? '').toLowerCase();
  if (!fb) throw new Error('This sign-in did not come from Facebook.');
  if (!email) throw new Error('Facebook did not share an email address. Allow email access when Facebook asks, or use Google.');
  if (!user.email_confirmed_at || fb.identity_data?.email_verified === false) throw new Error('Your Facebook email address is not verified.');
  if (!allowedEmails().includes(email)) throw new Error(`${email} is not on the allowed list for this site.`);
  return email;
}

function passwordMatches(req: Request): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return false;
  const a = Buffer.from(req.headers.get('x-app-password') ?? '');
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface Identity { ok: boolean; via?: 'open' | 'password' | 'google'; email?: string }

/** Single gate for every protected request. No password and no Google client ID configured = open mode (temporary). */
export async function authenticate(req: Request): Promise<Identity> {
  const mode = accessMode();
  if (mode === 'open') return { ok: true, via: 'open' };
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (mode.includes('google') && bearer) {
    const email = await readSession(bearer).catch(() => null);
    if (email) return { ok: true, via: 'google', email };
  }
  if (mode.includes('password') && passwordMatches(req)) return { ok: true, via: 'password' };
  return { ok: false };
}

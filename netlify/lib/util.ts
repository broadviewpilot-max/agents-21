import { timingSafeEqual } from 'node:crypto';

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/** TEMPORARY open mode: with no APP_PASSWORD set, the app is open to anyone with the URL. */
export const isOpen = () => !process.env.APP_PASSWORD;

export function authorized(req: Request): boolean {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return true; // open mode (temporary, by owner's choice); set APP_PASSWORD to lock the site
  const given = req.headers.get('x-app-password') ?? '';
  const a = Buffer.from(given);
  const b = Buffer.from(pw);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Pull the first balanced-looking JSON object out of model text. */
export function extractJson<T>(text: string): T {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in model output');
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const cap = (s: string, n: number) => (s.length > n ? s.slice(0, n) + '\n[truncated]' : s);

const KEY = 'aimsir-pw';
export const getPw = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setPw = (v: string) => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-app-password': getPw(), ...(init.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body: JSON.stringify(body) });

export async function downloadIcs() {
  const res = await fetch('/api/calendar.ics', { headers: { 'x-app-password': getPw() } });
  if (!res.ok) throw new Error('Could not build calendar file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = 'aimsir-funder-deadlines.ics'; a.click();
  URL.revokeObjectURL(url);
}

export const daysUntil = (iso?: string) => (iso ? Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000) : undefined);
export const money = (n?: number) => (n === undefined ? 'n/a' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

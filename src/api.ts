const KEY = 'aimsir-pw';
export const getPw = () => { try { return sessionStorage.getItem(KEY) ?? ''; } catch { return ''; } };
export const setPw = (v: string) => { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };

const TOKEN_KEY = 'aimsir-session';
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) ?? ''; } catch { return ''; } };
export const setToken = (v: string) => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ } };

export class ApiError extends Error { constructor(public status: number, msg: string) { super(msg); } }

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api/${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', 'x-app-password': getPw(), ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}), ...(init.headers ?? {}) },
  });
  if (res.status === 401) window.dispatchEvent(new Event('aimsir-unauthorized'));
  if (!res.ok) {
    let msg = res.statusText || `Server error (HTTP ${res.status})`;
    if (res.status === 502 || res.status === 504) msg = `The server took too long to answer (HTTP ${res.status}). Try again in a minute.`;
    try { msg = ((await res.json()) as { error?: string }).error ?? msg; } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}
export const post = <T,>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body: JSON.stringify(body ?? {}) });
export const patch = <T,>(p: string, body: unknown) => api<T>(p, { method: 'PATCH', body: JSON.stringify(body) });
export const put = <T,>(p: string, body: unknown) => api<T>(p, { method: 'PUT', body: JSON.stringify(body) });

export async function downloadIcs() {
  const res = await fetch('/api/calendar.ics', { headers: { 'x-app-password': getPw(), ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {}) } });
  if (!res.ok) throw new Error('Could not build calendar file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url; a.download = 'aimsir-funder-deadlines.ics'; a.click();
  URL.revokeObjectURL(url);
}

export const daysUntil = (iso?: string) => (iso ? Math.ceil((new Date(iso + 'T00:00:00').getTime() - Date.now()) / 86400000) : undefined);
export const money = (n?: number) => (n === undefined ? 'n/a' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

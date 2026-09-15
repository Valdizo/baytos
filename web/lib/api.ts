export const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function token() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('baytos_token');
}

export async function api(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.message || `Request failed (${res.status})`);
  return body;
}

export function money(minor: number, currency = 'USD') {
  const sign = minor < 0 ? '-' : '';
  return `${sign}${currency === 'USD' ? '$' : currency + ' '}${(Math.abs(minor) / 100).toFixed(2)}`;
}

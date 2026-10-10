import { headers } from 'next/headers';
export async function serverPassportAccess(id?: string) {
  const h = await headers();
  const host = h.get('host') || '';
  const local = process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) return null;
  const url = new URL('/api/passport', origin);
  url.searchParams.set('mode', 'access');
  if (id) url.searchParams.set('id', id);
  const response = await fetch(url, { cache: 'no-store', headers: { cookie: h.get('cookie') || '' } });
  if (!response.ok) return null;
  return response.json() as Promise<{ own: boolean; public: boolean; nick: string }>;
}

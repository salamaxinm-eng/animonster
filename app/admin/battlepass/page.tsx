import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BattlepassAdmin } from '@/components/battlepass-admin';
import '../../battlepass/battlepass.css';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const h = await headers();
  const host = h.get('host') || '';
  const local = process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) notFound();
  const response = await fetch(`${origin}/api/battlepass?season=oni-awakening&preview=1`, { cache: 'no-store', headers: { cookie: h.get('cookie') || '' } });
  if (!response.ok || !(await response.json()).canManage) notFound();
  return <BattlepassAdmin />;
}

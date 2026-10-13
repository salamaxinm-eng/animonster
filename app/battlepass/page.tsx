import type { Metadata } from 'next';
import { Suspense } from 'react';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { BattlepassPage } from '@/components/battlepass-page';
import '../profile-hub.css';
import './battlepass.css';
export const metadata: Metadata = { title: 'AniMonster Pass', description: 'Сезонный пропуск AniMonster. Смотри аниме, открывай уровни и получай оформление навсегда.' };
export const dynamic = 'force-dynamic';
export default async function Page() {
  const h = await headers();
  const host = h.get('host') || '';
  const local = process.env.NODE_ENV !== 'production' && /^localhost(?::\d+)?$/.test(host);
  const origin = local ? `http://${host}` : process.env.SITE_URL;
  if (!origin) notFound();
  const response = await fetch(`${origin}/api/battlepass/access`, { cache: 'no-store', headers: { cookie: h.get('cookie') || '' } });
  if (!response.ok || !(await response.json()).visible) notFound();
  return <Suspense fallback={<p>Загрузка AniMonster Pass…</p>}><BattlepassPage /></Suspense>;
}

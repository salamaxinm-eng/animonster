import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { demoCatalog } from '@/lib/server/player-demo';
import { PlayerDemo } from '@/components/player-demo';
import './player-demo.css';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Плеер AniMonster · Попробуй первым',
  description:
    'Re:Zero в нашем новом плеере: несколько озвучек, Full HD и удобное управление. Бесплатное демо для всех.',
  alternates: { canonical: '/player-demo' },
};

export default async function Page() {
  const catalog = await demoCatalog();
  if (!catalog) notFound();
  return <PlayerDemo catalog={catalog} />;
}

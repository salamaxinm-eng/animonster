import { NO_INDEX_ROBOTS } from '@/lib/seo';
import type { Metadata } from 'next';
import { WatchPartyRoom } from '@/components/watch-party-room';

export const metadata: Metadata = {
  title: 'Совместный просмотр — AniMonster',
  description: 'Приватная комната совместного просмотра AniMonster',
  robots: NO_INDEX_ROBOTS,
};

export default async function WatchPartyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <WatchPartyRoom code={code.toUpperCase()} />;
}

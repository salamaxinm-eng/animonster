import type { Metadata } from 'next';
import { HomePageClient } from '@/components/home-page-client';
import { cachedHomePopular } from '@/lib/server/home';

export const metadata: Metadata = { alternates: { canonical: '/' } };

export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialPopular = await cachedHomePopular();
  return <HomePageClient initialPopular={initialPopular} />;
}

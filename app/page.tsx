import { HomePageClient } from '@/components/home-page-client';
import { cachedHomePopular } from '@/lib/server/home';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const initialPopular = await cachedHomePopular().catch(() => []);
  return <HomePageClient initialPopular={initialPopular} />;
}

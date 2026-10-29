import ClientPage from './client-page';
import { fallbackRecommendations } from '@/lib/server/recommendations/service';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { listingSchema } from '@/lib/seo';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const entries = await fallbackRecommendations('guest');
  const items = entries.map((entry) => ({
    ...entry.anime,
    reason: entry.reason,
  }));
  return (
    <>
      <SeoJsonLd
        data={listingSchema('Рекомендации аниме', '/recommendations', items, 1)}
      />
      <ClientPage initialItems={items} />
    </>
  );
}

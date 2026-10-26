import type { MetadataRoute } from 'next';
import { sitemapAnime } from '@/lib/server/library';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://animonster.su';

// PostgreSQL bigint timestamps arrive as strings in production. Validate them
// before Next serializes dates, which happens after this function returns.
function lastModified(value: unknown): Date | undefined {
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  const milliseconds = Number(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= 0 || milliseconds > 8.64e15)
    return undefined;
  return new Date(milliseconds);
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: `${SITE_URL}/`,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${SITE_URL}/catalog`,
      changeFrequency: 'daily',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/genres`,
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/recommendations`,
      changeFrequency: 'daily',
      priority: 0.8,
    },
  ];

  try {
    const anime = await sitemapAnime(50000 - staticPages.length);
    return [
      ...staticPages,
      ...anime.map((item) => ({
        url: `${SITE_URL}/anime/${item.id}`,
        lastModified: lastModified(item.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}

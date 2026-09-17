import type { MetadataRoute } from 'next';
import { sitemapAnime } from '@/lib/server/library';

export const dynamic = 'force-dynamic';

const SITE_URL = 'https://animonster.su';

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
    {
      url: `${SITE_URL}/browse`,
      changeFrequency: 'daily',
      priority: 0.7,
    },
  ];

  try {
    const anime = await sitemapAnime();
    return [
      ...staticPages,
      ...anime.map((item) => ({
        url: `${SITE_URL}/anime/${item.id}`,
        lastModified: new Date(item.updated_at),
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}

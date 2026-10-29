import type { MetadataRoute } from 'next';
import { sitemapAnime, sitemapGenres } from '@/lib/server/library';

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
  ];

  try {
    const genres = await sitemapGenres();
    const genrePages = [...new Set(genres)].map((genre) => ({
      url: `${SITE_URL}/genres/${encodeURIComponent(genre)}`,
    }));
    const anime = await sitemapAnime(
      50000 - staticPages.length - genrePages.length,
    );
    return [
      ...staticPages,
      ...genrePages,
      ...anime.map((item) => ({
        url: `${SITE_URL}/anime/${item.id}`,
        // updated_at is a cache refresh timestamp, not a content modification.
        // Omit lastmod until the content has a dedicated modification timestamp.
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticPages;
  }
}

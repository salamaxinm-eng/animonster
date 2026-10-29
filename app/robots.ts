import type { MetadataRoute } from 'next';

const SITE_URL = 'https://animonster.su';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Bots must be allowed to read noindex on already-known technical URLs.
        // Authorization, not robots.txt, protects private data. Rendering assets
        // and media remain crawlable as well.
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

import type { MetadataRoute } from 'next';

const SITE_URL = 'https://animonster.su';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Image and other rendering resources under /api must remain crawlable.
        // Private endpoints enforce authorization themselves.
        disallow: [
          '/admin',
          '/profile',
          '/bookmarks',
          '/watch/',
          '/auth/',
          '/vpn',
          '/downloads',
          '/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

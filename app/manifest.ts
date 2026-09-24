import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AniMonster',
    short_name: 'AniMonster',
    description:
      'Смотри аниме онлайн и сохраняй серии AniMonster Plus для офлайна.',
    start_url: '/',
    display: 'standalone',
    background_color: '#080b10',
    theme_color: '#080b10',
    orientation: 'any',
    icons: [
      {
        src: '/icon.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
    ],
  };
}

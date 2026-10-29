import type { Anime } from './anime';
export const SITE_URL = 'https://animonster.su';
export const NO_INDEX_ROBOTS = {
  index: false,
  follow: false,
  googleBot: { index: false, follow: false },
} as const;
export const NO_INDEX_FOLLOW = {
  index: false,
  follow: true,
  googleBot: { index: false, follow: true },
} as const;
export function pageNumber(value?: string | string[]) {
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value)
    ? Number(value)
    : 1;
}
export function listingUrl(
  path: string,
  page = 1,
  tab = 'all',
  sort = 'rating',
) {
  const query = new URLSearchParams();
  if (tab === 'ongoing') query.set('tab', tab);
  if (sort === 'fresh') query.set('sort', sort);
  if (page > 1) query.set('page', String(page));
  return path + (query.size ? '?' + query : '');
}
export function animeTitle(anime: Anime) {
  const name = anime.russian || anime.name;
  const year = /^\d{4}(?:-|$)/.test(anime.aired_on || '')
    ? anime.aired_on.slice(0, 4)
    : '';
  const base = name + (year && !name.includes(year) ? ' (' + year + ')' : '');
  return base.length <= 85 ? base + ' — смотреть аниме онлайн' : base;
}
export function listingSchema(
  name: string,
  path: string,
  items: Anime[],
  page: number,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name,
    url: SITE_URL + path,
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.map((item, index) => ({
        '@type': 'ListItem',
        position: (page - 1) * 24 + index + 1,
        name: item.russian || item.name,
        url: SITE_URL + '/anime/' + item.id,
      })),
    },
  };
}

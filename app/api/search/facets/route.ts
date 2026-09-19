import { animeThemeCatalog } from '@/lib/server/anime-themes';
import { genreList } from '@/lib/server/library';

export async function GET() {
  try {
    const [genres, themes] = await Promise.all([
      genreList().then((items) => items.map((item) => item.name)),
      animeThemeCatalog().then((items) => items.map((item) => item.russian)),
    ]);
    return Response.json(
      {
        genres: [...new Set(genres)].sort((a, b) => a.localeCompare(b, 'ru')),
        themes: [...new Set(themes)].sort((a, b) => a.localeCompare(b, 'ru')),
        kinds: [
          { value: 'tv', label: 'Сериал' },
          { value: 'movie', label: 'Фильм' },
        ],
        statuses: [
          { value: 'ongoing', label: 'Онгоинг' },
          { value: 'released', label: 'Завершён' },
        ],
      },
      {
        headers: {
          'Cache-Control':
            'public, max-age=21600, stale-while-revalidate=86400',
        },
      },
    );
  } catch (error) {
    console.error('search_facets_failed', error);
    return Response.json(
      { error: 'Не удалось загрузить фильтры' },
      { status: 502 },
    );
  }
}

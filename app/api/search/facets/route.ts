import { animeThemeCatalog } from '@/lib/server/anime-themes';
import { db } from '@/lib/server/core';
import { genreList } from '@/lib/server/library';

export async function GET() {
  try {
    const [genreRows, themeRows] = await Promise.all([
      db()
        .prepare(
          `SELECT DISTINCT jsonb_array_elements_text(genres_index) AS name FROM anime_cache`,
        )
        .all<{ name: string }>(),
      db()
        .prepare(
          `SELECT DISTINCT jsonb_array_elements_text(themes) AS name FROM anime_search_metadata`,
        )
        .all<{ name: string }>(),
    ]);
    let genres = genreRows.results.map((item) => item.name).filter(Boolean);
    let themes = themeRows.results.map((item) => item.name).filter(Boolean);
    if (!genres.length)
      genres = await genreList()
        .then((items) => items.map((item) => item.name))
        .catch(() => []);
    if (!themes.length)
      themes = await animeThemeCatalog()
        .then((items) => items.map((item) => item.russian))
        .catch(() => []);
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

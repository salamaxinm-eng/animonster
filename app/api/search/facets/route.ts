import { db } from '@/lib/server/core';

export async function GET() {
  try {
    const [genreRows, themeRows] = await Promise.all([
      db()
        .prepare(
          `SELECT DISTINCT jsonb_array_elements_text(
             CASE WHEN jsonb_typeof(genres_index) = 'array' THEN genres_index
                  ELSE COALESCE(data::jsonb->'genres', '[]'::jsonb) END
           ) AS name FROM anime_cache`,
        )
        .all<{ name: string }>()
        .catch(() => ({ results: [] as { name: string }[] })),
      db()
        .prepare(
          `SELECT DISTINCT name FROM (
             SELECT jsonb_array_elements_text(themes) AS name
             FROM anime_search_metadata WHERE jsonb_typeof(themes) = 'array'
             UNION
             SELECT jsonb_array_elements_text(themes::jsonb) AS name
             FROM anime_themes_cache WHERE status = 'ok'
           ) indexed_themes`,
        )
        .all<{ name: string }>()
        .catch(() => ({ results: [] as { name: string }[] })),
    ]);
    const genres = genreRows.results.map((item) => item.name).filter(Boolean);
    const themes = themeRows.results.map((item) => item.name).filter(Boolean);
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

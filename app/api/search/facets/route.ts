import { db } from '@/lib/server/core';
import { animeTaxonomy } from '@/lib/server/anime-taxonomy';
import { partitionTags } from '@/lib/anime-taxonomy';

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
      animeTaxonomy(),
    ]);
    const genres = genreRows.results.map((item) => item.name).filter(Boolean);
    const themes = themeRows.themes;
    return Response.json(
      {
        genres: partitionTags(genres, themes).genres.sort((a, b) =>
          a.localeCompare(b, 'ru'),
        ),
        themes,
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

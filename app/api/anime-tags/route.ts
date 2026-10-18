import { animeThemes } from '@/lib/server/anime-themes';

import { db } from '@/lib/server/core';
import { animeTaxonomy } from '@/lib/server/anime-taxonomy';
import { partitionTags, uniqueTags } from '@/lib/anime-taxonomy';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('list') === 'themes') {
    try {
      const { themes } = await animeTaxonomy();
      return Response.json(
        { themes },
        {
          headers: {
            'Cache-Control':
              'public, max-age=3600, stale-while-revalidate=21600',
          },
        },
      );
    } catch {
      return Response.json(
        { error: 'Темы временно недоступны' },
        { status: 502 },
      );
    }
  }
  const id = Number(params.get('anime_id'));
  if (!Number.isInteger(id) || id < 1 || id > 999999999)
    return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });

  try {
    const [result, taxonomy, row] = await Promise.all([
      animeThemes(id),
      animeTaxonomy(),
      db()
        .prepare('SELECT data FROM anime_cache WHERE id=?')
        .bind(id)
        .first<{ data: string }>(),
    ]);
    const genres = row ? ((JSON.parse(row.data).genres || []) as string[]) : [];
    const classified = partitionTags(
      genres,
      uniqueTags([...taxonomy.themes, ...result.themes]),
    );
    return Response.json(
      {
        ...result,
        ...(row ? { genres: classified.genres } : {}),
        themes: uniqueTags([...result.themes, ...classified.themes]),
      },
      {
        headers: {
          'Cache-Control': result.unavailable
            ? 'no-store'
            : 'public, max-age=3600, stale-while-revalidate=86400',
        },
      },
    );
  } catch {
    return Response.json(
      { themes: [], unavailable: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

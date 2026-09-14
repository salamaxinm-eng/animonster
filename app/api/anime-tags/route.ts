import {
  animeThemeCatalog,
  animeThemes,
} from '@/lib/server/anime-themes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  if (params.get('list') === 'themes') {
    try {
      const themes = await animeThemeCatalog();
      return Response.json(
        { themes: themes.map((theme) => theme.russian) },
        {
          headers: {
            'Cache-Control': 'public, max-age=3600, stale-while-revalidate=21600',
          },
        },
      );
    } catch {
      return Response.json({ error: 'Темы временно недоступны' }, { status: 502 });
    }
  }
  const id = Number(params.get('anime_id'));
  if (!Number.isInteger(id) || id < 1 || id > 999999999)
    return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });

  try {
    const result = await animeThemes(id);
    return Response.json(result, {
      headers: {
        'Cache-Control': result.unavailable
          ? 'no-store'
          : 'public, max-age=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return Response.json(
      { themes: [], unavailable: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

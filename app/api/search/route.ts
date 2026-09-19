import { searchAnime } from '@/lib/server/search';

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const query = (params.get('q') || '').trim();
    if (query.length > 120)
      return Response.json(
        { error: 'Слишком длинный запрос' },
        { status: 400 },
      );
    const genres = params
      .getAll('genre')
      .map((value) => value.trim())
      .filter(Boolean);
    const themes = params
      .getAll('theme')
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      genres.length > 12 ||
      themes.length > 12 ||
      [...genres, ...themes].some((value) => value.length > 80)
    )
      return Response.json({ error: 'Некорректные фильтры' }, { status: 400 });
    const kind = params.get('kind');
    const status = params.get('status');
    const page = Number(params.get('page')) || 1;
    const limit = Number(params.get('limit')) || 24;
    return Response.json(
      await searchAnime({
        query,
        genres: [...new Set(genres)],
        themes: [...new Set(themes)],
        kind: kind === 'tv' || kind === 'movie' ? kind : '',
        status: status === 'ongoing' || status === 'released' ? status : '',
        page,
        limit,
      }),
      {
        headers: {
          'Cache-Control': 'public, max-age=20, stale-while-revalidate=120',
        },
      },
    );
  } catch (error) {
    console.error('search_failed', error);
    return Response.json(
      { error: 'Не удалось выполнить поиск' },
      { status: 500 },
    );
  }
}

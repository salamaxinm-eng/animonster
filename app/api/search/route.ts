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
    const page = Number(params.get('page')) || 1;
    return Response.json(await searchAnime({ query, page }), {
      headers: {
        'Cache-Control': 'public, max-age=20, stale-while-revalidate=120',
      },
    });
  } catch (error) {
    console.error('search_failed', error);
    return Response.json(
      { error: 'Не удалось выполнить поиск' },
      { status: 500 },
    );
  }
}

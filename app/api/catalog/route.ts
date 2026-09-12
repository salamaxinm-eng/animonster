import { genreList, rememberAnime } from '@/lib/server/library';
import { liberty, normalize, available, findRelease } from '@/lib/server/anime';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      id = Number(p.get('anime_id'));
    if (id) {
      if (!Number.isInteger(id) || id < 1 || id > 999999999)
        return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });
      const release = await findRelease(id);
      return Response.json(
        release && available(release) ? [normalize(release)] : [],
      );
    }
    const sorting: Record<string, string> = {
      fresh: 'FRESH_AT_DESC',
      year: 'YEAR_DESC',
      rating: 'RATING_DESC',
    };
    const query = new URLSearchParams({
      limit: '24',
      page: String(
        Math.max(1, Math.min(10000, Math.floor(Number(p.get('page')) || 1))),
      ),
      'f[sorting]': sorting[p.get('sort') || ''] || 'RATING_DESC',
    });
    if (p.get('q')) query.set('f[search]', p.get('q')!.slice(0, 100));
    if (p.get('kind') === 'movie') query.set('f[types]', 'MOVIE');
    if (p.get('kind') === 'ongoing')
      query.set('f[publish_statuses]', 'IS_ONGOING');
    if (p.get('genre')) {
      const genres = await genreList();
      const genre = genres.find(
        (g) => g.name.toLowerCase() === p.get('genre')!.toLowerCase(),
      );
      if (!genre)
        return Response.json([], {
          headers: { 'X-Total-Count': '0', 'X-Total-Pages': '1' },
        });
      query.set('f[genres]', String(genre.id));
    }
    const data = await liberty('/anime/catalog/releases?' + query);
    const items = data.data.filter(available).map(normalize);
    await rememberAnime(items);
    const pagination = data.meta.pagination;
    return Response.json(items, {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-Total-Count': String(pagination.total),
        'X-Total-Pages': String(pagination.total_pages),
      },
    });
  } catch {
    return Response.json(
      { error: 'Источник каталога временно недоступен' },
      { status: 502 },
    );
  }
}

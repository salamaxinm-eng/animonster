import {
  genreList,
  getAnime,
  getAnimeByAlias,
  rememberAnime,
  cachedCatalogPage,
} from '@/lib/server/library';
import {
  liberty,
  normalize,
  available,
  compactAnime,
} from '@/lib/server/anime';
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams,
    id = Number(p.get('anime_id'));
  try {
    if (id) {
      if (!Number.isInteger(id) || id < 1 || id > 999999999)
        return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });
      const result = await getAnime(id);
      return Response.json(result ? [result.anime] : []);
    }
    const alias = p.get('alias') || '';
    if (alias) {
      const result = await getAnimeByAlias(alias);
      return Response.json(result ? [result.anime] : []);
    }
    const sorting: Record<string, string> = {
      fresh: 'FRESH_AT_DESC',
      year: 'YEAR_DESC',
      rating: 'RATING_DESC',
    };
    const page = Math.max(
      1,
      Math.min(10000, Math.floor(Number(p.get('page')) || 1)),
    );
    const sort = p.get('sort') || 'rating';
    const search = p.get('q') || '';
    const genreName = p.get('genre') || '';
    const kind = p.get('kind') === 'movie' ? 'movie' : '';
    const cacheFirst =
      !search && sort === 'rating' && p.get('kind') !== 'ongoing' && page <= 20;
    if (cacheFirst) {
      const cached = await cachedCatalogPage({
        genre: genreName,
        kind,
        limit: 24,
        offset: (page - 1) * 24,
      });
      if (cached.items.length) {
        return Response.json(compactAnime(cached.items), {
          headers: {
            'Cache-Control': 'public, max-age=30, stale-while-revalidate=600',
            'X-Data-Source': 'cache',
            'X-Total-Count': String(cached.total),
            'X-Total-Pages': String(Math.max(1, Math.ceil(cached.total / 24))),
          },
        });
      }
    }
    const query = new URLSearchParams({
      limit: '24',
      page: String(page),
      'f[sorting]': sorting[sort] || 'RATING_DESC',
    });
    if (search) query.set('f[search]', search.slice(0, 100));
    if (p.get('kind') === 'movie') query.set('f[types]', 'MOVIE');
    if (p.get('kind') === 'ongoing')
      query.set('f[publish_statuses]', 'IS_ONGOING');
    if (genreName) {
      const genres = await genreList();
      const genre = genres.find(
        (g) => g.name.toLowerCase() === genreName.toLowerCase(),
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
    return Response.json(compactAnime(items), {
      headers: {
        'Cache-Control': 'public, max-age=60',
        'X-Total-Count': String(pagination.total),
        'X-Total-Pages': String(pagination.total_pages),
      },
    });
  } catch {
    if (id || p.get('alias'))
      return Response.json(
        { error: 'Источник каталога временно недоступен' },
        { status: 502 },
      );
    try {
      const page = Math.max(1, Math.floor(Number(p.get('page')) || 1));
      const kind = p.get('kind') === 'movie' ? 'movie' : '';
      const cached = await cachedCatalogPage({
        genre: p.get('genre') || '',
        kind,
        limit: 24,
        offset: (page - 1) * 24,
        query: p.get('q') || '',
      });
      return Response.json(compactAnime(cached.items), {
        headers: {
          'Cache-Control': 'public, max-age=30, stale-while-revalidate=300',
          'X-Data-Source': 'cache',
          'X-Total-Count': String(cached.total),
          'X-Total-Pages': String(Math.max(1, Math.ceil(cached.total / 24))),
        },
      });
    } catch {
      return Response.json(
        { error: 'Источник каталога временно недоступен' },
        { status: 502 },
      );
    }
  }
}

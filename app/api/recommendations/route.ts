import { db, viewer, json, fail, now } from '@/lib/server/core';
import { genresCatalog } from '@/lib/server/library';
import type { Anime } from '@/lib/anime';
export async function GET(r: Request) {
  try {
    const u = await viewer(r);
    if (!u) {
      const rows = await db()
        .prepare(
          'SELECT v.anime_id,count(*) AS n,a.data FROM daily_views v JOIN anime_cache a ON a.id=v.anime_id WHERE v.day>=? GROUP BY v.anime_id ORDER BY n DESC LIMIT 20',
        )
        .bind(new Date(now() - 6 * 86400000).toISOString().slice(0, 10))
        .all<{ data: string }>();
      const weekly = rows.results.map((x) => JSON.parse(x.data) as Anime);
      const fallback = weekly.length < 18 ? await genresCatalog([]) : [];
      const items = Array.from(
        new Map(
          [...weekly, ...fallback].map((anime) => [anime.id, anime]),
        ).values(),
      ).slice(0, 20);
      return json({
        sections: [
          {
            title: rows.results.length
              ? 'Популярное за неделю'
              : 'Популярное в каталоге',
            note: rows.results.length
              ? 'По просмотрам на AniMonster за последние 7 дней, дополнено хитами каталога.'
              : 'Пока недостаточно просмотров для недельного рейтинга.',
            items,
          },
        ],
      });
    }
    const recent = await db()
      .prepare(
        'SELECT h.anime_id,a.data,MAX(h.updated_at) AS last_at FROM history h JOIN anime_cache a ON a.id=h.anime_id WHERE h.user_id=? GROUP BY h.anime_id ORDER BY last_at DESC LIMIT 10',
      )
      .bind(u.id)
      .all<{ anime_id: number; data: string }>();
    const favorites = await db()
      .prepare(
        'SELECT c.anime_id,a.data FROM collection c JOIN anime_cache a ON a.id=c.anime_id WHERE c.user_id=? AND c.favorite=1',
      )
      .bind(u.id)
      .all<{ anime_id: number; data: string }>();
    const excludedRows = await db()
      .prepare(
        'SELECT anime_id FROM history WHERE user_id=? UNION SELECT anime_id FROM collection WHERE user_id=? AND favorite=1',
      )
      .bind(u.id, u.id)
      .all<{ anime_id: number }>();
    const excluded = new Set(excludedRows.results.map((x) => x.anime_id));
    const frequency: Record<string, number> = {};
    for (const row of [...recent.results, ...favorites.results])
      for (const genre of (JSON.parse(row.data) as Anime).genres || [])
        frequency[genre] = (frequency[genre] || 0) + 1;
    const top = Object.keys(frequency)
      .sort((a, b) => frequency[b] - frequency[a])
      .slice(0, 3);
    const score = (a: Anime) =>
      (a.genres || []).reduce((s, g) => s + (frequency[g] || 0), 0);
    const clean = (items: Anime[]) =>
      Array.from(
        new Map(
          items.filter((a) => !excluded.has(a.id)).map((a) => [a.id, a]),
        ).values(),
      )
        .sort((a, b) => score(b) - score(a))
        .slice(0, 18);
    if (!top.length)
      return json({
        sections: [
          {
            title: 'Открой своё первое аниме',
            note: 'Посмотри серию или добавь тайтл в избранное — подборки станут персональными.',
            items: clean(await genresCatalog([])),
          },
        ],
      });
    const [candidates, ongoing] = await Promise.all([
      Promise.all(top.map((g) => genresCatalog([g]))).then((x) => x.flat()),
      genresCatalog([top[0]], true),
    ]);
    const last = recent.results[0]
      ? (JSON.parse(recent.results[0].data) as Anime)
      : null;
    return json({
      sections: [
        ...(last
          ? [
              {
                title: 'Похожее на «' + last.russian + '»',
                items: clean(
                  candidates.filter((a) =>
                    a.genres?.some((g) => last.genres?.includes(g)),
                  ),
                ),
              },
            ]
          : []),
        {
          title: 'Поскольку тебе нравится ' + top[0],
          items: clean(candidates.filter((a) => a.genres?.includes(top[0]))),
        },
        { title: 'Вам может понравиться · онгоинги', items: clean(ongoing) },
      ],
    });
  } catch (e) {
    return fail(e);
  }
}

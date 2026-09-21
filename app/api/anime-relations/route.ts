import { animeRelations } from '@/lib/server/anime-relations';

export async function GET(request: Request) {
  if (process.env.ANIMONSTER_RELATION_UI_TEST === 'true') {
    const item = (id: number, year: number) => ({
      item: {
        id,
        russian: `Тестовая часть ${id}`,
        name: `Test ${id}`,
        image: { original: '/icon.png' },
        score: '8',
        kind: 'tv',
        episodes: 12,
        aired_on: String(year),
      },
      label: `Сезон ${id}`,
      active: id === 1,
    });
    return Response.json({
      mainline: Array.from({ length: 6 }, (_, index) =>
        item(index + 1, 2000 + index),
      ),
      branches: [],
      related: Array.from({ length: 9 }, (_, index) => ({
        ...item(index + 20, 2010 + index),
        label: 'Другая история',
        active: false,
      })),
    });
  }
  const animeId = Number(new URL(request.url).searchParams.get('anime_id'));
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });
  try {
    return Response.json(await animeRelations(animeId), {
      headers: {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      },
    });
  } catch (error) {
    console.error('anime_relations_failed', error);
    return Response.json(
      { error: 'Не удалось загрузить связанные тайтлы' },
      { status: 502 },
    );
  }
}

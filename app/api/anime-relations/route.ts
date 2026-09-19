import { animeRelations } from '@/lib/server/anime-relations';

export async function GET(request: Request) {
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

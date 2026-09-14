import { animeThemes } from '@/lib/server/anime-themes';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const id = Number(new URL(request.url).searchParams.get('anime_id'));
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

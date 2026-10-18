import { animeScreenshot } from '@/lib/server/anime-screenshots';

export async function GET(request: Request) {
  const animeId = Number(new URL(request.url).searchParams.get('anime_id'));
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999) {
    return Response.json({ error: 'Некорректный тайтл' }, { status: 400 });
  }
  try {
    const image = await animeScreenshot(animeId);
    return Response.json(
      { image },
      {
        headers: { 'Cache-Control': `public, max-age=${image ? 3600 : 300}` },
      },
    );
  } catch {
    // Optional artwork must never block resuming a video.
    return Response.json(
      { image: null },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }
}

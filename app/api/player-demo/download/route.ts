import { ApiError, fail, json } from '@/lib/server/core';
import { demoCatalog } from '@/lib/server/player-demo';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      catalog = await demoCatalog();
    const seasonId = p.get('season');
    const season =
      seasonId && catalog?.season?.id === seasonId ? catalog.season : undefined;
    if (seasonId && !season)
      throw new ApiError('Этот объединённый файл недоступен', 404);
    const episode = catalog?.episodes.find(
      (e) => e.number === Number(p.get('episode')),
    );
    const target = season || episode;
    const voice = target?.voices.find((v) => v.id === p.get('voice'));
    const quality = voice?.qualities.find(
      (q) => q.height === Number(p.get('quality')),
    );
    if (!target || !voice || !quality?.download)
      throw new ApiError('Это качество ещё готовится для скачивания', 404);
    return json({
      ok: true,
      provider: 'demo',
      downloadId: season
        ? `demo-${season.id}-${voice.id}-${quality.height}`
        : `demo-${episode!.number}-${voice.id}-${quality.height}`,
      animeId: 61316,
      animeTitle: catalog!.title,
      animePoster: '/icon-512.png',
      episode: season ? 0 : episode!.number,
      duration: target.duration,
      ...(season
        ? { season: { id: season.id, chapters: season.chapters } }
        : {}),
      quality: quality.height,
      voiceoverId: voice.id,
      voiceoverName: voice.title,
      manifestUrl: quality.url,
      mediaUrl: quality.download.url,
      mediaSize: quality.download.size,
      subtitles: target.subtitles || [],
      expiresAt: Date.UTC(2100, 0, 1),
      offlineAccessUntil: Date.UTC(2100, 0, 1),
    });
  } catch (error) {
    return fail(error);
  }
}

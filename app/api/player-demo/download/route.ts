import { ApiError, fail, json } from '@/lib/server/core';
import { demoCatalog } from '@/lib/server/player-demo';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  try {
    const p = new URL(request.url).searchParams,
      catalog = await demoCatalog();
    const episode = catalog?.episodes.find(
      (e) => e.number === Number(p.get('episode')),
    );
    const voice = episode?.voices.find((v) => v.id === p.get('voice'));
    const quality = voice?.qualities.find(
      (q) => q.height === Number(p.get('quality')),
    );
    if (!episode || !voice || !quality?.download)
      throw new ApiError('Это качество ещё готовится для скачивания', 404);
    return json({
      ok: true,
      provider: 'demo',
      downloadId: `demo-${episode.number}-${voice.id}-${quality.height}`,
      animeId: 61316,
      animeTitle: catalog!.title,
      animePoster: '/icon-512.png',
      episode: episode.number,
      duration: episode.duration,
      quality: quality.height,
      voiceoverId: voice.id,
      voiceoverName: voice.title,
      manifestUrl: quality.url,
      mediaUrl: quality.download.url,
      mediaSize: quality.download.size,
      subtitles: episode.subtitles || [],
      expiresAt: Date.UTC(2100, 0, 1),
      offlineAccessUntil: Date.UTC(2100, 0, 1),
    });
  } catch (error) {
    return fail(error);
  }
}

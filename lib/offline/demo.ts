import type { OfflineManifest, OfflinePrepareResponse } from './types';
export const DEMO_CHUNK_SIZE = 8 * 1024 * 1024;
export function demoDownloadManifest(
  prepared: OfflinePrepareResponse,
): OfflineManifest {
  const size = prepared.mediaSize;
  if (
    !size ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    !prepared.mediaUrl ||
    !/^\/demo-media\/[a-zA-Z0-9/_-]+\.mp4$/.test(prepared.mediaUrl)
  )
    throw new Error('Некорректный файл загрузки');
  const segments: OfflineManifest['segments'] = [];
  for (let offset = 0; offset < size; offset += DEMO_CHUNK_SIZE) {
    const index = segments.length;
    segments.push({
      id: `mp4-${index}`,
      fileName: `mp4-${String(index).padStart(6, '0')}.bin`,
      remoteUrl: prepared.mediaUrl,
      kind: 'segment',
      downloaded: false,
      size: 0,
      rangeStart: offset,
      rangeEnd: Math.min(size - 1, offset + DEMO_CHUNK_SIZE - 1),
    });
  }
  for (const [index, track] of (prepared.subtitles || []).entries()) {
    if (!/^\/demo-media\/[a-zA-Z0-9/_-]+\.vtt$/.test(track.url))
      throw new Error('Некорректные субтитры');
    segments.push({
      id: `subtitle-${index}`,
      fileName: `subtitle-${index}.vtt`,
      remoteUrl: track.url,
      kind: 'map',
      downloaded: false,
      size: 0,
    });
  }
  return { playlist: '', segments };
}
export function validRangeResponse(
  header: string | null,
  start: number,
  end: number,
  size: number,
) {
  return header === `bytes ${start}-${end}/${size}`;
}

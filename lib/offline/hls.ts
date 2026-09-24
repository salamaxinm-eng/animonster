import type { OfflineManifest, OfflineSegment } from './types';

function absolute(value: string, base: string) {
  return new URL(value, base).href;
}

export function masterVariant(manifest: string, base: string, quality: number) {
  const lines = manifest.split(/\r?\n/);
  const variants: { url: string; height: number; bandwidth: number }[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (!lines[index].startsWith('#EXT-X-STREAM-INF:')) continue;
    const attributes = lines[index];
    const resolution = /RESOLUTION=\d+x(\d+)/i.exec(attributes);
    const bandwidth = /BANDWIDTH=(\d+)/i.exec(attributes);
    const uri = lines
      .slice(index + 1)
      .find((line) => line.trim() && !line.startsWith('#'));
    if (uri)
      variants.push({
        url: absolute(uri.trim(), base),
        height: Number(resolution?.[1] || 0),
        bandwidth: Number(bandwidth?.[1] || 0),
      });
  }
  if (!variants.length) return null;
  return [...variants].sort(
    (a, b) =>
      Math.abs((a.height || quality) - quality) -
        Math.abs((b.height || quality) - quality) || b.bandwidth - a.bandwidth,
  )[0].url;
}

export function parseMediaPlaylist(
  manifest: string,
  manifestUrl: string,
  episodeId: string,
): OfflineManifest {
  if (/^#EXT-X-KEY:(?![^\n]*METHOD=NONE)/m.test(manifest))
    throw new Error('Зашифрованный HLS пока нельзя сохранить офлайн.');
  const lines = manifest.split(/\r?\n/);
  const segments: OfflineSegment[] = [];
  const maps = new Map<string, OfflineSegment>();
  let duration: number | undefined;
  const output = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#EXTINF:')) {
      duration = Number(trimmed.slice(8).split(',')[0]) || undefined;
      return line;
    }
    if (trimmed.startsWith('#EXT-X-MAP:')) {
      const match = /URI="([^"]+)"/.exec(line);
      if (!match) return line;
      const remoteUrl = absolute(match[1], manifestUrl);
      let item = maps.get(remoteUrl);
      if (!item) {
        item = {
          id: `map-${maps.size}`,
          fileName: `map-${String(maps.size).padStart(3, '0')}.bin`,
          remoteUrl,
          kind: 'map',
          downloaded: false,
          size: 0,
        };
        maps.set(remoteUrl, item);
        segments.push(item);
      }
      const local = `offline://animonster/${encodeURIComponent(episodeId)}/file/${encodeURIComponent(item.fileName)}`;
      return line.replace(match[1], local);
    }
    if (!trimmed || trimmed.startsWith('#')) return line;
    const sequence = segments.filter((item) => item.kind === 'segment').length;
    const item: OfflineSegment = {
      id: `segment-${sequence}`,
      fileName: `segment-${String(sequence).padStart(6, '0')}.bin`,
      remoteUrl: absolute(trimmed, manifestUrl),
      duration,
      kind: 'segment',
      downloaded: false,
      size: 0,
    };
    duration = undefined;
    segments.push(item);
    return `offline://animonster/${encodeURIComponent(episodeId)}/file/${encodeURIComponent(item.fileName)}`;
  });
  if (!segments.some((item) => item.kind === 'segment'))
    throw new Error('Источник вернул пустой HLS-плейлист.');
  return { playlist: output.join('\n'), segments };
}

export function missingSegmentIds(manifest: OfflineManifest) {
  return manifest.segments
    .filter((item) => !item.downloaded)
    .map((item) => item.id);
}

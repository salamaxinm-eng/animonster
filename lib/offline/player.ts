'use client';

import { readOfflineFile } from './storage';
import type { OfflineEpisode } from './types';

export function offlinePlaybackUrl(episode: OfflineEpisode) {
  return `offline://animonster/${encodeURIComponent(episode.id)}/manifest.m3u8`;
}

export function createOfflineHlsLoader(episode: OfflineEpisode) {
  return class OfflineHlsLoader {
    private aborted = false;
    constructor(_config: unknown) {}
    load(context: any, _config: any, callbacks: any) {
      const started = performance.now();
      void (async () => {
        try {
          let data: string | ArrayBuffer;
          if (String(context.url).endsWith('/manifest.m3u8')) {
            data = episode.manifestData?.playlist || '';
          } else {
            const url = new URL(context.url);
            const marker = '/file/';
            const index = url.pathname.indexOf(marker);
            if (index < 0) throw new Error('Неизвестный локальный сегмент');
            const name = decodeURIComponent(
              url.pathname.slice(index + marker.length),
            );
            data = await (
              await readOfflineFile(episode.id, name)
            ).arrayBuffer();
          }
          if (this.aborted) return;
          const loaded =
            typeof data === 'string' ? data.length : data.byteLength;
          callbacks.onSuccess(
            { url: context.url, data, code: 200 },
            {
              aborted: false,
              loaded,
              total: loaded,
              retry: 0,
              chunkCount: 1,
              bwEstimate: 0,
              loading: {
                start: started,
                first: started,
                end: performance.now(),
              },
              parsing: { start: 0, end: 0 },
              buffering: { start: 0, first: 0, end: 0 },
            },
            context,
            null,
          );
        } catch (error) {
          if (!this.aborted)
            callbacks.onError(
              { code: 0, text: (error as Error).message },
              context,
              null,
              null,
            );
        }
      })();
    }
    abort() {
      this.aborted = true;
    }
    destroy() {
      this.aborted = true;
    }
  };
}

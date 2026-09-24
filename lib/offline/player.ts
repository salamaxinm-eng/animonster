'use client';

import { readOfflineFile } from './storage';
import type { OfflineEpisode } from './types';
import type {
  LoaderCallbacks,
  LoaderConfiguration,
  LoaderContext,
  LoaderStats,
} from 'hls.js';

export function offlinePlaybackUrl(episode: OfflineEpisode) {
  return `offline://animonster/${encodeURIComponent(episode.id)}/manifest.m3u8`;
}

export function createOfflineHlsLoader(episode: OfflineEpisode) {
  return class OfflineHlsLoader {
    context: LoaderContext | null = null;
    stats: LoaderStats = {
      aborted: false,
      loaded: 0,
      retry: 0,
      total: 0,
      chunkCount: 0,
      bwEstimate: 0,
      loading: { start: 0, first: 0, end: 0 },
      parsing: { start: 0, end: 0 },
      buffering: { start: 0, first: 0, end: 0 },
    };
    private callbacks: LoaderCallbacks<LoaderContext> | null = null;
    constructor(_config: unknown) {}

    load(
      context: LoaderContext,
      _config: LoaderConfiguration,
      callbacks: LoaderCallbacks<LoaderContext>,
    ) {
      const started = performance.now();
      this.context = context;
      this.callbacks = callbacks;
      this.stats.aborted = false;
      this.stats.loaded = 0;
      this.stats.total = 0;
      this.stats.chunkCount = 0;
      this.stats.loading = { start: started, first: 0, end: 0 };
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
            if (
              typeof context.rangeStart === 'number' &&
              typeof context.rangeEnd === 'number'
            )
              data = data.slice(context.rangeStart, context.rangeEnd);
          }
          if (this.stats.aborted) return;
          const loaded =
            typeof data === 'string' ? data.length : data.byteLength;
          const finished = performance.now();
          this.stats.loaded = loaded;
          this.stats.total = loaded;
          this.stats.chunkCount = 1;
          this.stats.bwEstimate = Math.round(
            (loaded * 8000) / Math.max(1, finished - started),
          );
          this.stats.loading.first = finished;
          this.stats.loading.end = finished;
          callbacks.onSuccess(
            { url: context.url, data, code: 200 },
            this.stats,
            context,
            null,
          );
        } catch (error) {
          if (!this.stats.aborted)
            callbacks.onError(
              { code: 0, text: (error as Error).message },
              context,
              null,
              this.stats,
            );
        }
      })();
    }

    abort() {
      if (this.stats.aborted) return;
      this.stats.aborted = true;
      this.stats.loading.end = performance.now();
      if (this.context)
        this.callbacks?.onAbort?.(this.stats, this.context, null);
    }

    destroy() {
      this.stats.aborted = true;
      this.context = null;
      this.callbacks = null;
    }
  };
}

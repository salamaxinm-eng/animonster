import {
  parseSceneMatches,
  record,
  traceError,
  TRACE_SEARCH_URL,
  type SceneMatch,
} from './photo-search';

export type PhotoVariant = { label: string; image: () => Promise<Blob> };
export type PreparedSceneMatch = SceneMatch & { variant: string };

// Sequential and bounded: never fan out against trace.moe, never retry a quota
// error, and keep useful results when a later variant/provider request fails.
export async function runPhotoSearch(
  variants: PhotoVariant[],
  signal: AbortSignal,
  progress: (label: string, index: number, total: number) => void,
  transport: typeof fetch = fetch,
) {
  const best = new Map<number, PreparedSceneMatch>();
  const uploaded = new Set<string>();
  let attempts = 0;
  let warning = '';
  for (const [index, variant] of variants.slice(0, 4).entries()) {
    signal.throwIfAborted();
    progress(variant.label, index + 1, Math.min(4, variants.length));
    const controller = new AbortController();
    const abort = () => controller.abort(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const blob = await variant.image();
      signal.throwIfAborted();
      if (globalThis.crypto?.subtle) {
        const hash = new Uint8Array(
          await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()),
        );
        const key = Array.from(hash, (byte) =>
          byte.toString(16).padStart(2, '0'),
        ).join('');
        if (uploaded.has(key)) continue;
        uploaded.add(key);
      }
      signal.throwIfAborted();
      const form = new FormData();
      form.append('image', blob, 'frame.jpg');
      attempts++;
      const response = await transport(TRACE_SEARCH_URL, {
        method: 'POST',
        body: form,
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        cache: 'no-store',
      });
      const raw = await response.text();
      if (raw.length > 2_000_000)
        throw Error('Сервис вернул слишком большой ответ.');
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        throw Error(traceError(response.status, null));
      }
      if (!response.ok || record(payload).error)
        throw Error(
          traceError(
            response.status,
            payload,
            response.headers.get('Retry-After'),
          ),
        );
      signal.throwIfAborted();
      for (const match of parseSceneMatches(payload)) {
        // A nearest neighbor is always returned, even when the anime is absent.
        // Do not present unrelated 60–70% scenes as a recognized title.
        if (match.similarity < 0.9) continue;
        if ((best.get(match.anilistId)?.similarity ?? -1) < match.similarity)
          best.set(match.anilistId, { ...match, variant: variant.label });
      }
      if ([...best.values()].some((item) => item.similarity >= 0.94)) break;
    } catch (error) {
      signal.throwIfAborted();
      const message = controller.signal.aborted
        ? 'Сервис распознавания не ответил вовремя.'
        : error instanceof TypeError
          ? 'Не удалось связаться с trace.moe. Проверьте подключение или попробуйте позже.'
          : error instanceof Error
            ? error.message
            : 'Не удалось распознать кадр.';
      if (!best.size) throw Error(message);
      warning = message + ' Показываем найденные ранее совпадения.';
      break;
    } finally {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
    }
  }
  signal.throwIfAborted();
  return {
    matches: [...best.values()]
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3),
    attempts,
    warning,
  };
}

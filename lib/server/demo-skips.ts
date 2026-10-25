import type { DemoCatalog, DemoSegment } from '../player-demo';

type Times = { opening?: DemoSegment; ending?: DemoSegment };
const cache = new Map<string, { until: number; value: Times }>();
const pending = new Map<string, Promise<Times>>();
export function matchedDemoSkips(payload: unknown, duration: number): Times {
  const raw = payload as {
    found?: boolean;
    results?: {
      skipType?: string;
      episodeLength?: number;
      interval?: { startTime?: number; endTime?: number };
    }[];
  };
  const result: Times = {};
  if (!raw?.found || !Array.isArray(raw.results)) return result;
  for (const kind of ['op', 'ed'] as const) {
    const matches = raw.results
      .filter(
        (item) =>
          item.skipType === kind &&
          Number.isFinite(item.episodeLength) &&
          Math.abs(item.episodeLength! - duration) <= 5,
      )
      .sort(
        (a, b) =>
          Math.abs(a.episodeLength! - duration) -
          Math.abs(b.episodeLength! - duration),
      );
    const item = matches[0];
    if (!item?.interval) continue;
    const start = item.interval.startTime!,
      stop = item.interval.endTime!;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(stop) ||
      start < 0 ||
      stop <= start ||
      stop - start > 240 ||
      stop > duration
    )
      continue;
    result[kind === 'op' ? 'opening' : 'ending'] = { start, stop };
  }
  return result;
}
async function load(
  mal: number,
  episode: number,
  duration: number,
): Promise<Times> {
  const key = `${mal}:${episode}:${duration}`;
  const saved = cache.get(key);
  if (saved && saved.until > Date.now()) return saved.value;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    let value: Times = {};
    let ok = false;
    try {
      const params = new URLSearchParams([
        ['types', 'op'],
        ['types', 'ed'],
        ['episodeLength', String(duration)],
      ]);
      const response = await fetch(
        `https://api.aniskip.com/v2/skip-times/${mal}/${episode}?${params}`,
        { signal: AbortSignal.timeout(3500), cache: 'no-store' },
      );
      if (response.ok) {
        value = matchedDemoSkips(await response.json(), duration);
        ok = true;
      }
    } catch {}
    cache.set(key, {
      value,
      until: Date.now() + (ok ? 6 * 3600000 : 5 * 60000),
    });
    return value;
  })();
  pending.set(key, task);
  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
export async function enrichDemoSkips(catalog: DemoCatalog) {
  if (!catalog.malId) return catalog;
  return {
    ...catalog,
    episodes: await Promise.all(
      catalog.episodes.map(async (episode) => {
        const times = await load(
          catalog.malId!,
          episode.number,
          episode.duration,
        );
        return {
          ...episode,
          voices: episode.voices.map((voice) => ({
            ...voice,
            opening: times.opening || voice.opening,
            ending: times.ending || voice.ending,
          })),
        };
      }),
    ),
  };
}

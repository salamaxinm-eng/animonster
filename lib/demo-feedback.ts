import type { DemoChapter } from './player-demo';

export type WatchRange = [number, number];
export type DemoCoverage = Record<string, WatchRange[]>;
export type FeedbackEpisode = { number: number; duration: number };
export type DemoFeedbackState = {
  scope: string;
  watched: DemoCoverage;
  eligible: boolean;
  submitted: boolean;
  dismissedUntil: number;
};
export const FEEDBACK_SNOOZE = 7 * 24 * 3600000;

export function normalizeRanges(
  value: unknown,
  duration: number,
): WatchRange[] {
  if (!Array.isArray(value) || value.length > 512)
    throw new Error('Invalid watch ranges');
  const sorted: WatchRange[] = value
    .map<WatchRange>((range) => {
      if (
        !Array.isArray(range) ||
        range.length !== 2 ||
        !range.every(Number.isFinite) ||
        range[0] < 0 ||
        range[1] <= range[0] ||
        range[1] > duration + 1
      )
        throw new Error('Invalid watch interval');
      return [Math.min(duration, range[0]), Math.min(duration, range[1])];
    })
    .filter(([start, stop]) => stop > start)
    .sort((a, b) => a[0] - b[0]);
  const result: WatchRange[] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range[0] <= last[1] + 0.01)
      last[1] = Math.max(last[1], range[1]);
    else result.push([...range]);
  }
  return result;
}

export function mergeCoverage(
  a: unknown,
  b: unknown,
  episodes: FeedbackEpisode[],
): DemoCoverage {
  const result: DemoCoverage = {};
  for (const episode of episodes) {
    const old = (a as DemoCoverage | null)?.[episode.number] || [];
    const fresh = (b as DemoCoverage | null)?.[episode.number] || [];
    // Normalize each side first so overlapping updates never exhaust the limit.
    const ranges = normalizeRanges(
      [
        ...normalizeRanges(old, episode.duration),
        ...normalizeRanges(fresh, episode.duration),
      ],
      episode.duration,
    );
    if (ranges.length) result[episode.number] = ranges;
  }
  return result;
}

export function feedbackEligible(
  watched: DemoCoverage,
  episodes: FeedbackEpisode[],
) {
  return (
    episodes.filter(
      (episode) =>
        (watched[episode.number] || []).reduce(
          (total, [start, stop]) => total + stop - start,
          0,
        ) +
          1e-6 >=
        episode.duration * 0.7,
    ).length >= 3
  );
}

export type WatchSample = {
  position: number;
  wall: number;
  playing: boolean;
  rate: number;
};
export function playedInterval(
  previous: WatchSample | null,
  current: WatchSample,
): WatchRange | undefined {
  if (!previous || !previous.playing || !current.playing) return;
  const elapsed = (current.wall - previous.wall) / 1000,
    delta = current.position - previous.position;
  if (
    elapsed <= 0 ||
    elapsed > 15 ||
    delta <= 0 ||
    delta > elapsed * Math.max(previous.rate, current.rate) + 0.5
  )
    return;
  return [previous.position, current.position];
}

export function addPlaybackRange(
  watched: DemoCoverage,
  range: WatchRange,
  episodes: FeedbackEpisode[],
  chapters?: DemoChapter[],
  episode?: number,
) {
  const fresh: DemoCoverage = {};
  if (chapters) {
    for (const chapter of chapters) {
      const start = Math.max(range[0], chapter.start),
        stop = Math.min(range[1], chapter.stop);
      if (stop > start)
        fresh[chapter.episode] = [
          [start - chapter.start, stop - chapter.start],
        ];
    }
  } else if (episode) fresh[episode] = [range];
  return mergeCoverage(watched, fresh, episodes);
}

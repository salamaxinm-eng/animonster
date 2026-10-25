import type { DemoSeason } from './player-demo';

export function seasonPoint(season: DemoSeason, time: number) {
  const position = Number.isFinite(time)
    ? Math.max(0, Math.min(time, season.duration))
    : 0;
  const chapter =
    season.chapters.find(
      (item) => position >= item.start && position < item.stop,
    ) || season.chapters[season.chapters.length - 1];
  return {
    episode: chapter.episode,
    position: Math.max(
      0,
      Math.min(position - chapter.start, chapter.stop - chapter.start),
    ),
  };
}

export function seasonPosition(
  season: DemoSeason,
  episode: number,
  position: number,
) {
  const chapter =
    season.chapters.find((item) => item.episode === episode) ||
    season.chapters[0];
  return (
    chapter.start +
    Math.max(
      0,
      Math.min(
        Number.isFinite(position) ? position : 0,
        chapter.stop - chapter.start,
      ),
    )
  );
}

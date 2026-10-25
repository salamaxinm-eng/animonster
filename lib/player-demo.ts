export type DemoSegment = { start: number; stop: number };
export type DemoVoice = {
  id: string;
  title: string;
  master: string;
  qualities: {
    height: number;
    url: string;
    download?: { url: string; size: number };
  }[];
  opening?: DemoSegment;
  ending?: DemoSegment;
};
export type DemoEpisode = {
  number: number;
  title: string;
  duration: number;
  preview?: string;
  voices: DemoVoice[];
  subtitles?: { title: string; language: string; url: string }[];
};
export type DemoCatalog = {
  version: 1;
  title: string;
  malId?: number;
  episodes: DemoEpisode[];
  season?: DemoSeason;
};
export type DemoChapter = { episode: number; start: number; stop: number };
export type DemoSeason = Omit<DemoEpisode, 'number' | 'title'> & {
  chapters: DemoChapter[];
};

const mediaPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^\/demo-media\/[a-zA-Z0-9/_-]+\.(m3u8|vtt|mp4|jpg)$/.test(value) &&
  !value.includes('//');
const segment = (value: unknown, duration: number): DemoSegment | undefined => {
  const item = value as Partial<DemoSegment> | undefined;
  return item &&
    Number.isFinite(item.start) &&
    Number.isFinite(item.stop) &&
    item.start! >= 0 &&
    item.stop! > item.start! &&
    item.stop! <= duration
    ? { start: item.start!, stop: item.stop! }
    : undefined;
};

// Build the response explicitly: private import paths and torrent metadata never leave the server.
export function parseDemoCatalog(value: unknown): DemoCatalog {
  const raw = value as Partial<DemoCatalog> | null;
  if (
    raw?.version !== 1 ||
    typeof raw.title !== 'string' ||
    !Array.isArray(raw.episodes)
  )
    throw new Error('Invalid demo catalog');
  const numbers = new Set<number>();
  const episodes = raw.episodes
    .map((episode) => {
      if (
        !Number.isInteger(episode.number) ||
        episode.number < 1 ||
        numbers.has(episode.number) ||
        !Number.isFinite(episode.duration) ||
        episode.duration <= 0 ||
        typeof episode.title !== 'string' ||
        !Array.isArray(episode.voices) ||
        !episode.voices.length
      )
        throw new Error('Invalid demo episode');
      numbers.add(episode.number);
      const ids = new Set<string>();
      const voices = episode.voices.map((voice) => {
        if (
          !/^[a-z0-9_-]+$/.test(voice.id) ||
          ids.has(voice.id) ||
          typeof voice.title !== 'string' ||
          !mediaPath(voice.master) ||
          !voice.master.endsWith('.m3u8') ||
          !Array.isArray(voice.qualities) ||
          !voice.qualities.length
        )
          throw new Error('Invalid demo voice');
        ids.add(voice.id);
        const qualities = voice.qualities.map((quality) => {
          if (
            ![360, 480, 720, 1080].includes(quality.height) ||
            !mediaPath(quality.url) ||
            !quality.url.endsWith('.m3u8')
          )
            throw new Error('Invalid demo quality');
          const download = quality.download;
          if (
            download &&
            (!mediaPath(download.url) ||
              !download.url.endsWith('.mp4') ||
              !Number.isSafeInteger(download.size) ||
              download.size <= 0)
          )
            throw new Error('Invalid download');
          return {
            height: quality.height,
            url: quality.url,
            ...(download
              ? { download: { url: download.url, size: download.size } }
              : {}),
          };
        });
        return {
          id: voice.id,
          title: voice.title,
          master: voice.master,
          qualities,
          opening: segment(voice.opening, episode.duration),
          ending: segment(voice.ending, episode.duration),
        };
      });
      const subtitles = episode.subtitles?.map((track) => {
        if (
          !mediaPath(track.url) ||
          !track.url.endsWith('.vtt') ||
          typeof track.title !== 'string' ||
          !/^[a-z]{2,3}$/.test(track.language)
        )
          throw new Error('Invalid subtitles');
        return { title: track.title, language: track.language, url: track.url };
      });
      return {
        number: episode.number,
        title: episode.title,
        duration: episode.duration,
        ...(episode.preview &&
        mediaPath(episode.preview) &&
        episode.preview.endsWith('.vtt')
          ? { preview: episode.preview }
          : {}),
        voices,
        subtitles,
      };
    })
    .sort((a, b) => a.number - b.number);
  return {
    version: 1,
    title: raw.title,
    episodes,
    ...(raw.season ? { season: parseSeason(raw.season, episodes) } : {}),
    ...(Number.isInteger(raw.malId) && raw.malId! > 0
      ? { malId: raw.malId }
      : {}),
  };
}

function parseSeason(value: DemoSeason, episodes: DemoEpisode[]): DemoSeason {
  if (
    !value ||
    !Array.isArray(value.chapters) ||
    value.chapters.length < 2 ||
    value.chapters.length > episodes.length
  )
    throw new Error('Invalid season chapters');
  let end = 0;
  const chapters = value.chapters.map((chapter, index) => {
    const episode = episodes[index];
    if (
      chapter.episode !== episode.number ||
      !Number.isFinite(chapter.start) ||
      !Number.isFinite(chapter.stop) ||
      Math.abs(chapter.start - end) > 0.001 ||
      chapter.stop <= chapter.start ||
      Math.abs(chapter.stop - chapter.start - episode.duration) > 1
    )
      throw new Error('Invalid season boundary');
    end = chapter.stop;
    return {
      episode: chapter.episode,
      start: chapter.start,
      stop: chapter.stop,
    };
  });
  if (Math.abs(end - value.duration) > 0.001)
    throw new Error('Invalid season duration');
  const parsed = parseDemoCatalog({
    version: 1,
    title: 'Season',
    episodes: [{ ...value, number: 1, title: 'Season' }],
  }).episodes[0];
  if (
    parsed.voices.some((v) =>
      episodes.some((e) => !e.voices.some((ev) => ev.id === v.id)),
    )
  )
    throw new Error('Invalid season voice');
  return {
    duration: parsed.duration,
    voices: parsed.voices,
    subtitles: parsed.subtitles,
    preview: parsed.preview,
    chapters,
  };
}

export function boundedPosition(position: number, duration: number) {
  return Number.isFinite(position) && Number.isFinite(duration)
    ? Math.max(0, Math.min(position, Math.max(0, duration - 0.2)))
    : 0;
}

export function activeDemoSegment(voice: DemoVoice, time: number) {
  return ([voice.opening, voice.ending] as const).find(
    (item) => item && time >= item.start && time < item.stop - 0.25,
  );
}

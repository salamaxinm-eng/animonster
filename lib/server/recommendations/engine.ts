import type { Anime } from '@/lib/anime';
import { RECOMMENDATION_RESULT_LIMIT, RECOMMENDATION_WEIGHTS } from './config';

export type TasteEvent = {
  anime: Anime;
  weight: number;
  updatedAt: number;
  completion: number;
};

export type CandidateInput = {
  anime: Anime;
  collaborative?: number;
  trending?: number;
  penalty?: number;
};

export type UserCandidateState = {
  fullyWatched?: boolean;
  favorite?: boolean;
  dropped?: boolean;
  rating?: number;
  startedCompletion?: number;
};

export type RankedRecommendation = {
  anime: Anime;
  score: number;
  reason: string;
  source:
    | 'personal'
    | 'collaborative'
    | 'trending'
    | 'fresh'
    | 'exploration'
    | 'quality';
};

export type TasteProfile = {
  genres: Map<string, number>;
  behaviour: Map<string, number>;
  strongestGenre: string;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const genreKey = (genre: string) => genre.trim().toLocaleLowerCase('ru-RU');

export function userCandidatePenalty(state: UserCandidateState) {
  if (state.fullyWatched || state.favorite) return null;
  let penalty = state.dropped ? 0.28 : 0;
  if (state.rating && state.rating <= 4) penalty += (5 - state.rating) * 0.04;
  if (state.startedCompletion != null)
    penalty += state.startedCompletion < 0.25 ? 0.14 : 0.08;
  return penalty;
}

export function buildTasteProfile(events: TasteEvent[], at = Date.now()) {
  const genres = new Map<string, number>();
  const completed = new Map<string, number>();
  const started = new Map<string, number>();
  for (const event of events) {
    const days = Math.max(0, at - event.updatedAt) / 86_400_000;
    const decay = Math.exp(-days / 90);
    for (const rawGenre of event.anime.genres || []) {
      const genre = genreKey(rawGenre);
      genres.set(genre, (genres.get(genre) || 0) + event.weight * decay);
      started.set(genre, (started.get(genre) || 0) + decay);
      completed.set(
        genre,
        (completed.get(genre) || 0) + clamp(event.completion) * decay,
      );
    }
  }
  const magnitude = Math.sqrt(
    [...genres.values()].reduce((sum, value) => sum + value * value, 0),
  );
  if (magnitude)
    for (const [genre, value] of genres) genres.set(genre, value / magnitude);
  const behaviour = new Map<string, number>();
  for (const [genre, starts] of started)
    behaviour.set(
      genre,
      starts ? clamp((completed.get(genre) || 0) / starts) : 0,
    );
  const strongestGenre =
    [...genres.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ||
    '';
  return { genres, behaviour, strongestGenre } satisfies TasteProfile;
}

function personalSimilarity(anime: Anime, profile: TasteProfile) {
  const genres = (anime.genres || []).map(genreKey);
  if (!genres.length || !profile.genres.size) return 0;
  const dot = genres.reduce(
    (sum, genre) => sum + (profile.genres.get(genre) || 0),
    0,
  );
  return clamp(dot / Math.sqrt(genres.length));
}

function behaviourScore(anime: Anime, profile: TasteProfile) {
  const values = (anime.genres || [])
    .map((genre) => profile.behaviour.get(genreKey(genre)))
    .filter((value): value is number => value != null);
  return values.length
    ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0.35;
}

function qualityScore(anime: Anime) {
  const rating = clamp((Number(anime.score) || 0) / 10);
  const popularity = clamp(Math.log10(1 + (anime.popularity || 0)) / 5);
  return clamp(rating * 0.8 + popularity * 0.2);
}

function freshnessScore(anime: Anime, year: number) {
  const released = Number(String(anime.aired_on || '').slice(0, 4));
  if (!released) return 0.2;
  if (released > year) return 1;
  return clamp(Math.exp(-Math.max(0, year - released) / 4));
}

function stableExploration(userId: string, animeId: number, at: number) {
  const week = Math.floor(at / (7 * 86_400_000));
  const source = `${userId}:${animeId}:${week}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function reasonFor(
  anime: Anime,
  profile: TasteProfile,
  signals: {
    personal: number;
    collaborative: number;
    trending: number;
    freshness: number;
    quality: number;
    exploration: number;
  },
) {
  const source: RankedRecommendation['source'] =
    signals.personal >= 0.35
      ? 'personal'
      : signals.collaborative >= 0.25
        ? 'collaborative'
        : signals.exploration >= 0.72
          ? 'exploration'
          : signals.trending >= 0.35
            ? 'trending'
            : signals.freshness >= 0.78
              ? 'fresh'
              : 'quality';
  const matchingGenre = (anime.genres || []).find((genre) =>
    profile.genres.has(genreKey(genre)),
  );
  const reasons = {
    personal: matchingGenre
      ? `Потому что вам нравится ${matchingGenre.toLocaleLowerCase('ru-RU')}`
      : 'Похоже на просмотренные вами аниме',
    collaborative: 'Популярно среди зрителей с похожими вкусами',
    trending: 'Сейчас набирает популярность',
    fresh: 'Новинка для вас',
    quality: 'Высокая оценка зрителей',
    exploration: 'Возможно, вам понравится',
  } as const;
  return { source, reason: reasons[source] };
}

export function scoreCandidates(
  userId: string,
  candidates: CandidateInput[],
  profile: TasteProfile,
  at = Date.now(),
) {
  const year = new Date(at).getUTCFullYear();
  return candidates.map(
    ({ anime, collaborative = 0, trending = 0, penalty = 0 }) => {
      const personal = personalSimilarity(anime, profile);
      const behaviour = behaviourScore(anime, profile);
      const quality = qualityScore(anime);
      const freshness = freshnessScore(anime, year);
      const exploration = stableExploration(userId, anime.id, at) * quality;
      const score = clamp(
        personal * RECOMMENDATION_WEIGHTS.personalSimilarity +
          clamp(collaborative) * RECOMMENDATION_WEIGHTS.collaborativeScore +
          behaviour * RECOMMENDATION_WEIGHTS.behaviourScore +
          quality * RECOMMENDATION_WEIGHTS.qualityScore +
          freshness * RECOMMENDATION_WEIGHTS.freshnessScore +
          clamp(trending) * RECOMMENDATION_WEIGHTS.trendingScore +
          exploration * RECOMMENDATION_WEIGHTS.explorationScore -
          clamp(penalty),
      );
      return {
        anime,
        score,
        ...reasonFor(anime, profile, {
          personal,
          collaborative,
          trending,
          freshness,
          quality,
          exploration,
        }),
      } satisfies RankedRecommendation;
    },
  );
}

export function franchiseKey(anime: Anime) {
  const ignored = new Set([
    'season',
    'сезон',
    'movie',
    'фильм',
    'part',
    'часть',
    'ova',
    'special',
    'tv',
    'shippuden',
    'next',
    'generation',
  ]);
  const words = (anime.name || anime.russian)
    .toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .split(/\s+/)
    .filter(
      (word) => word.length > 1 && !/^\d+$/.test(word) && !ignored.has(word),
    );
  return words.slice(0, 2).join(' ');
}

export function rerankRecommendations(
  ranked: RankedRecommendation[],
  limit = RECOMMENDATION_RESULT_LIMIT,
) {
  const pool = [...ranked]
    .sort((left, right) => right.score - left.score)
    .slice(0, 100);
  const result: RankedRecommendation[] = [];
  const franchises = new Set<string>();
  const genreCounts = new Map<string, number>();
  const takeBest = (
    source?: RankedRecommendation['source'],
    allowRepeatedFranchise = false,
  ) => {
    let bestIndex = -1;
    let bestScore = -Infinity;
    for (let index = 0; index < pool.length; index++) {
      const item = pool[index];
      if (source && item.source !== source) continue;
      const franchise = franchiseKey(item.anime);
      if (!allowRepeatedFranchise && franchise && franchises.has(franchise))
        continue;
      const genrePenalty = Math.max(
        0,
        ...(item.anime.genres || []).map(
          (genre) =>
            Math.max(0, (genreCounts.get(genreKey(genre)) || 0) - 3) * 0.04,
        ),
      );
      const adjusted = item.score - genrePenalty;
      if (adjusted > bestScore) {
        bestScore = adjusted;
        bestIndex = index;
      }
    }
    if (bestIndex < 0) return false;
    const [selected] = pool.splice(bestIndex, 1);
    result.push(selected);
    const franchise = franchiseKey(selected.anime);
    if (franchise) franchises.add(franchise);
    for (const genre of selected.anime.genres || []) {
      const key = genreKey(genre);
      genreCounts.set(key, (genreCounts.get(key) || 0) + 1);
    }
    return true;
  };
  while (pool.length && result.length < Math.min(8, limit))
    if (!takeBest()) break;
  const mix: [RankedRecommendation['source'], number][] = [
    ['collaborative', 4],
    ['trending', 3],
    ['fresh', 2],
    ['exploration', 2],
    ['quality', 1],
  ];
  for (const [source, count] of mix)
    for (let index = 0; index < count && result.length < limit; index++)
      if (!takeBest(source)) break;
  while (pool.length && result.length < limit && takeBest()) {}
  while (pool.length && result.length < limit) takeBest(undefined, true);
  return result;
}

import { now } from '@/lib/server/core';
import {
  buildTasteProfile,
  rerankRecommendations,
  scoreCandidates,
  userCandidatePenalty,
  type CandidateInput,
  type TasteEvent,
} from './engine';
import {
  claimRecommendationUser,
  claimRecommendationUsers,
  failRecommendationUser,
  loadFallbackCandidates,
  loadRecommendationInputs,
  saveRecommendations,
} from './repository';

const clamp = (value: number) => Math.max(0, Math.min(1, value));

function tasteEvents(
  inputs: Awaited<ReturnType<typeof loadRecommendationInputs>>,
  at: number,
) {
  const events: TasteEvent[] = [];
  for (const item of inputs.history) {
    const completion = item.duration
      ? clamp(item.watchedSeconds / item.duration)
      : 0;
    const seasonCompleted =
      item.anime.episodes > 0 && item.episodesCompleted >= item.anime.episodes;
    const weight =
      1 +
      (completion >= 0.9 ? 5 : completion >= 0.5 ? 3 : 0) +
      (seasonCompleted ? 9 : 0);
    events.push({
      anime: item.anime,
      weight,
      updatedAt: item.updatedAt,
      completion,
    });
  }
  for (const item of inputs.collection) {
    let weight = 0;
    if (item.favorite) weight += 10;
    if (item.status === 'completed') weight += 9;
    else if (item.status === 'planned') weight += 4;
    else if (item.status === 'dropped') weight -= 5;
    if (item.rating)
      weight += Math.max(-8, Math.min(8, (item.rating - 5) * 1.6));
    if (weight)
      events.push({
        anime: item.anime,
        weight,
        updatedAt: at - 30 * 86_400_000,
        completion: item.status === 'completed' ? 1 : 0,
      });
  }
  return events;
}

function candidateInputs(
  inputs: Awaited<ReturnType<typeof loadRecommendationInputs>>,
) {
  const history = new Map(inputs.history.map((item) => [item.animeId, item]));
  const collection = new Map(
    inputs.collection.map((item) => [item.animeId, item]),
  );
  return inputs.candidates.flatMap((anime): CandidateInput[] => {
    const watched = history.get(anime.id);
    const saved = collection.get(anime.id);
    const fullyWatched =
      saved?.status === 'completed' ||
      (!!watched &&
        anime.episodes > 0 &&
        watched.episodesCompleted >= anime.episodes);
    const penalty = userCandidatePenalty({
      fullyWatched,
      favorite: saved?.favorite,
      dropped: saved?.status === 'dropped',
      rating: saved?.rating,
      startedCompletion: watched
        ? watched.duration
          ? watched.watchedSeconds / watched.duration
          : 0
        : undefined,
    });
    if (penalty == null) return [];
    return [
      {
        anime,
        collaborative: inputs.collaborative.get(anime.id) || 0,
        trending: inputs.trending.get(anime.id) || 0,
        penalty,
      },
    ];
  });
}

export async function recomputeUserRecommendations(userId: string) {
  const startedAt = now();
  console.info(
    JSON.stringify({ event: 'recommendation_recompute_started', userId }),
  );
  try {
    const inputs = await loadRecommendationInputs(userId);
    const profile = buildTasteProfile(
      tasteEvents(inputs, startedAt),
      startedAt,
    );
    const candidates = candidateInputs(inputs);
    const ranked = rerankRecommendations(
      scoreCandidates(userId, candidates, profile, startedAt),
    );
    await saveRecommendations(userId, ranked, startedAt);
    console.info(
      JSON.stringify({
        event: 'recommendation_recompute_completed',
        userId,
        candidateCount: candidates.length,
        resultCount: ranked.length,
        durationMs: now() - startedAt,
      }),
    );
    return { candidateCount: candidates.length, resultCount: ranked.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    await failRecommendationUser(userId, message).catch(() => {});
    console.error(
      JSON.stringify({
        event: 'recommendation_recompute_failed',
        userId,
        durationMs: now() - startedAt,
        error: message,
      }),
    );
    throw error;
  }
}

export async function recomputeRecommendationBatch(limit = 10) {
  const users = await claimRecommendationUsers(
    Math.max(1, Math.min(25, limit)),
  );
  const results = [];
  for (const userId of users) {
    try {
      results.push({
        userId,
        ok: true,
        ...(await recomputeUserRecommendations(userId)),
      });
    } catch {
      results.push({ userId, ok: false });
    }
  }
  return results;
}

export async function forceRecomputeUser(userId: string) {
  if (!(await claimRecommendationUser(userId))) return null;
  return recomputeUserRecommendations(userId);
}

export async function fallbackRecommendations(seed = 'guest') {
  const at = now();
  const { candidates, trending } = await loadFallbackCandidates();
  const inputs = candidates.map((anime) => ({
    anime,
    trending: trending.get(anime.id) || 0,
  }));
  return rerankRecommendations(
    scoreCandidates(seed, inputs, buildTasteProfile([], at), at),
  );
}

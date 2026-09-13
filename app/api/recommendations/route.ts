import type { Anime } from '@/lib/anime';
import { viewer, json, fail } from '@/lib/server/core';
import { compactAnime } from '@/lib/server/anime';
import {
  ensureRecommendationState,
  hasRecommendationSignals,
  readUserRecommendations,
} from '@/lib/server/recommendations/repository';
import { fallbackRecommendations } from '@/lib/server/recommendations/service';

function response(
  entries: { anime: Anime; reason: string }[],
  personalized: boolean,
) {
  const items = entries.map((entry) => ({
    anime: compactAnime([entry.anime])[0],
    reason: entry.reason,
  }));
  return json({
    items,
    personalized,
    sections: [
      {
        title: personalized ? 'Для вас' : 'Рекомендуем посмотреть',
        note: personalized
          ? 'Подобрано по вашей истории, оценкам и коллекции.'
          : 'Популярные, свежие и высоко оценённые тайтлы.',
        items: items.map((item) => ({ ...item.anime, reason: item.reason })),
      },
    ],
  });
}

export async function GET(request: Request) {
  try {
    const user = await viewer(request);
    if (user) {
      await ensureRecommendationState(user.id);
      const stored = await readUserRecommendations(user.id);
      if (stored.length)
        return response(stored, await hasRecommendationSignals(user.id));
    }
    const fallback = await fallbackRecommendations(user?.id || 'guest');
    return response(fallback, false);
  } catch (error) {
    return fail(error);
  }
}

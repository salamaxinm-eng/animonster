export const RECOMMENDATION_ALGORITHM_VERSION = 1;
export const RECOMMENDATION_MAX_CANDIDATES = 400;
export const RECOMMENDATION_MAX_HISTORY = 150;
export const RECOMMENDATION_MAX_SIMILAR_USERS = 50;
export const RECOMMENDATION_MAX_NEIGHBOUR_EVENTS = 500;
export const RECOMMENDATION_RESULT_LIMIT = 20;
export const RECOMMENDATION_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
export const RECOMMENDATION_LOCK_MS = 5 * 60 * 1000;

export const RECOMMENDATION_WEIGHTS = {
  personalSimilarity: 0.32,
  collaborativeScore: 0.25,
  behaviourScore: 0.15,
  qualityScore: 0.1,
  freshnessScore: 0.08,
  trendingScore: 0.06,
  explorationScore: 0.04,
} as const;

import type { Episode, SkipSegment } from '@/lib/anime';
import { db, now } from './core';

export type SkipConfidence = 'exact' | 'matched' | 'unverified';
export type SkipTimes = {
  opening?: SkipSegment;
  ending?: SkipSegment;
  source: 'override' | 'aniliberty' | 'aniskip' | 'mixed' | 'none';
  confidence: SkipConfidence;
  opening_confidence?: SkipConfidence;
  ending_confidence?: SkipConfidence;
  reference_duration?: number;
};

type StoredTimes = {
  opening_start: number | null;
  opening_stop: number | null;
  ending_start: number | null;
  ending_stop: number | null;
};

const NONE: SkipTimes = { source: 'none', confidence: 'unverified' };

export function validSegment(
  value: unknown,
  duration: number,
): SkipSegment | undefined {
  if (!value || typeof value !== 'object') return;
  const { start, stop } = value as { start?: unknown; stop?: unknown };
  const from = Number(start),
    to = Number(stop);
  if (
    !Number.isFinite(from) ||
    !Number.isFinite(to) ||
    from < 0 ||
    to <= from ||
    to - from > 240 ||
    (duration > 0 && to > duration + 2)
  )
    return;
  return {
    start: Math.round(from * 1000) / 1000,
    stop: Math.round(to * 1000) / 1000,
  };
}

function storedSegment(
  start: number | null,
  stop: number | null,
  duration: number,
) {
  return validSegment(
    start == null || stop == null ? null : { start, stop },
    duration,
  );
}

function fromStored(
  row: StoredTimes,
  duration: number,
  source: SkipTimes['source'],
  confidence: SkipConfidence,
  referenceDuration?: number,
): SkipTimes {
  const opening = storedSegment(row.opening_start, row.opening_stop, duration);
  const ending = storedSegment(row.ending_start, row.ending_stop, duration);
  return {
    opening,
    ending,
    source,
    confidence,
    opening_confidence: opening ? confidence : undefined,
    ending_confidence: ending ? confidence : undefined,
    reference_duration: referenceDuration,
  };
}

async function overrideFor(
  animeId: number,
  episode: number,
  voiceover: string,
  duration: number,
) {
  const row = await db()
    .prepare(
      "SELECT opening_start,opening_stop,ending_start,ending_stop FROM skip_time_overrides WHERE anime_id=? AND episode=? AND voiceover IN (?, '*') ORDER BY CASE WHEN voiceover=? THEN 0 ELSE 1 END LIMIT 1",
    )
    .bind(animeId, episode, voiceover, voiceover)
    .first<StoredTimes>();
  return row ? fromStored(row, duration, 'override', 'exact', duration) : null;
}

type AniSkipResult = {
  interval?: { startTime?: number; endTime?: number };
  skipType?: string;
  episodeLength?: number;
};

async function aniSkip(
  malId: number,
  episode: number,
  duration: number,
): Promise<SkipTimes> {
  const durationKey = Math.max(0, Math.round(duration));
  const cached = await db()
    .prepare(
      'SELECT opening_start,opening_stop,ending_start,ending_stop,source,confidence,found,updated_at FROM skip_time_cache WHERE mal_id=? AND episode=? AND duration=?',
    )
    .bind(malId, episode, durationKey)
    .first<
      StoredTimes & {
        source: string;
        confidence: SkipConfidence;
        found: number;
        updated_at: number;
      }
    >();
  const ttl = cached?.found ? 30 * 86400000 : 86400000;
  if (cached && cached.updated_at > now() - ttl)
    return cached.found
      ? fromStored(cached, duration, 'aniskip', cached.confidence)
      : NONE;

  let times: SkipTimes = NONE;
  try {
    const params = new URLSearchParams();
    params.append('types', 'op');
    params.append('types', 'ed');
    params.set('episodeLength', String(durationKey));
    const response = await fetch(
      `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?${params}`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (response.ok) {
      const payload = (await response.json()) as {
        found?: boolean;
        results?: AniSkipResult[];
      };
      const results = payload.results || [];
      const picked = (kind: 'op' | 'ed') =>
        results.find((item) => item.skipType === kind);
      const openingResult = picked('op'),
        endingResult = picked('ed'),
        referenceDuration = Number(
          openingResult?.episodeLength ||
            endingResult?.episodeLength ||
            durationKey,
        ),
        shift =
          durationKey > 0 && referenceDuration > 0
            ? durationKey - referenceDuration
            : 0,
        convert = (result?: AniSkipResult) =>
          validSegment(
            result?.interval
              ? {
                  start: Number(result.interval.startTime) + shift,
                  stop: Number(result.interval.endTime) + shift,
                }
              : null,
            duration,
          ),
        confidence: SkipConfidence =
          durationKey > 0 &&
          referenceDuration > 0 &&
          Math.abs(durationKey - referenceDuration) <=
            Math.max(5, referenceDuration * 0.01)
            ? 'matched'
            : 'unverified';
      const opening = convert(openingResult),
        ending = convert(endingResult);
      if (payload.found && (opening || ending))
        times = {
          opening,
          ending,
          source: 'aniskip',
          confidence,
          opening_confidence: opening ? confidence : undefined,
          ending_confidence: ending ? confidence : undefined,
          reference_duration: referenceDuration,
        };
    }
  } catch {}

  await db()
    .prepare(
      `INSERT INTO skip_time_cache(mal_id,episode,duration,opening_start,opening_stop,ending_start,ending_stop,source,confidence,found,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(mal_id,episode,duration) DO UPDATE SET opening_start=excluded.opening_start,opening_stop=excluded.opening_stop,ending_start=excluded.ending_start,ending_stop=excluded.ending_stop,source=excluded.source,confidence=excluded.confidence,found=excluded.found,updated_at=excluded.updated_at`,
    )
    .bind(
      malId,
      episode,
      durationKey,
      times.opening?.start ?? null,
      times.opening?.stop ?? null,
      times.ending?.start ?? null,
      times.ending?.stop ?? null,
      times.source,
      times.confidence,
      times.source === 'none' ? 0 : 1,
      now(),
    )
    .run();
  return times;
}

export async function resolveSkipTimes({
  animeId,
  malId,
  episode,
  duration,
  provider,
  voiceover,
  libertyEpisode,
  playbackDurationVerified = false,
}: {
  animeId: number;
  malId?: number;
  episode: number;
  duration: number;
  provider: 'aniliberty' | 'kodik';
  voiceover: string;
  libertyEpisode?: Episode;
  playbackDurationVerified?: boolean;
}): Promise<SkipTimes> {
  const manual = await overrideFor(animeId, episode, voiceover, duration);
  const libertyConfidence: SkipConfidence =
      provider === 'aniliberty'
        ? 'exact'
        : playbackDurationVerified &&
            libertyEpisode?.duration &&
            Math.abs(duration - libertyEpisode.duration) <=
              Math.max(5, libertyEpisode.duration * 0.01)
          ? 'matched'
          : 'unverified',
    libertyOpening = validSegment(libertyEpisode?.opening, duration),
    libertyEnding = validSegment(libertyEpisode?.ending, duration);

  let fallback: SkipTimes = NONE;
  if (
    malId &&
    Number.isInteger(malId) &&
    ((!manual?.opening && !libertyOpening) ||
      (!manual?.ending && !libertyEnding))
  ) {
    fallback = await aniSkip(malId, episode, duration);
    if (provider === 'kodik' && !playbackDurationVerified) {
      fallback = {
        ...fallback,
        confidence: 'unverified',
        opening_confidence: fallback.opening ? 'unverified' : undefined,
        ending_confidence: fallback.ending ? 'unverified' : undefined,
      };
    }
  }

  const opening = manual?.opening || libertyOpening || fallback.opening,
    ending = manual?.ending || libertyEnding || fallback.ending,
    openingConfidence = manual?.opening
      ? 'exact'
      : libertyOpening
        ? libertyConfidence
        : fallback.opening_confidence,
    endingConfidence = manual?.ending
      ? 'exact'
      : libertyEnding
        ? libertyConfidence
        : fallback.ending_confidence;
  if (!opening && !ending) return NONE;

  const sources = new Set<SkipTimes['source']>();
  if (manual?.opening || manual?.ending) sources.add('override');
  if (libertyOpening || libertyEnding) sources.add('aniliberty');
  if (fallback.opening || fallback.ending) sources.add('aniskip');
  const confidences = [openingConfidence, endingConfidence].filter(
    (value): value is SkipConfidence => Boolean(value),
  );
  const confidence = confidences.includes('unverified')
    ? 'unverified'
    : confidences.includes('matched')
      ? 'matched'
      : 'exact';

  return {
    opening,
    ending,
    source:
      sources.size === 1 ? (sources.values().next().value ?? 'none') : 'mixed',
    confidence,
    opening_confidence: openingConfidence,
    ending_confidence: endingConfidence,
    reference_duration:
      fallback.reference_duration || libertyEpisode?.duration || duration,
  };
}

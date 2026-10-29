import type { Anime } from '@/lib/anime';
import { db, now } from './core';
import { normalizeKodikVoiceovers, type KodikResult } from './kodik';
import { titleBlocked, visitorCountry } from './title-restrictions';

export type PublicAnimeAvailability = {
  status: 'cached' | 'age-restricted' | 'region-restricted';
  total: number;
  episodes: { ordinal: number; access: 'free' | 'plus' | 'unknown' }[];
  voiceovers: { title: string; type: 'voice' | 'subtitles' }[];
  updatedAt?: number;
};

export async function publicAnimeAvailability(
  anime: Anime,
  headers: Headers,
): Promise<PublicAnimeAvailability> {
  const empty = { total: 0, episodes: [], voiceovers: [] };
  // This is an anonymous public snapshot, never a route around player consent.
  if (anime.is_adult) return { ...empty, status: 'age-restricted' };
  if (await titleBlocked(headers, anime))
    return { ...empty, status: 'region-restricted' };
  if (anime.status === 'anons') return { ...empty, status: 'cached' };
  const [sources, links, access] = await Promise.all([
    db()
      .prepare(
        "SELECT payload,last_seen_at FROM anime_sources WHERE provider='kodik' AND anime_id=? AND active=1",
      )
      .bind(anime.id)
      .all<{ payload: string; last_seen_at: number }>(),
    db()
      .prepare(
        'SELECT translation_id,episode FROM kodik_episode_links WHERE anime_id=?',
      )
      .bind(anime.id)
      .all<{ translation_id: number; episode: number }>(),
    db()
      .prepare(
        'SELECT episode,first_seen_at,free_at FROM anime_episode_availability WHERE anime_id=?',
      )
      .bind(anime.id)
      .all<{ episode: number; first_seen_at: number; free_at: number }>(),
  ]);
  const country = visitorCountry(headers);
  const allowed = sources.results.flatMap((row) => {
    try {
      const item = JSON.parse(row.payload) as KodikResult;
      if (item.material_data?.anime_status === 'anons') return [];
      const blocked = (item.blocked_countries || []).map((x) =>
        x.toUpperCase() === 'RUS' ? 'RU' : x.toUpperCase(),
      );
      if (blocked.length && (!country || blocked.includes(country))) return [];
      return [{ item, checkedAt: Number(row.last_seen_at) }];
    } catch {
      return [];
    }
  });
  const voices = normalizeKodikVoiceovers(
    allowed.map((row) => row.item),
    anime,
  );
  const ordinals = new Set<number>();
  for (const voice of voices) {
    // Only exact episode maps or stored per-episode links prove individual
    // episodes. episodes_total, episodes_count and last_episode do not.
    for (const ordinal of voice.episode_ordinals || []) ordinals.add(ordinal);
    const translation = Number(voice.id.split(':').at(-1));
    if (!voice.episode_ordinals?.length)
      for (const link of links.results)
        if (
          Number(link.translation_id) === translation &&
          Number.isInteger(Number(link.episode)) &&
          link.episode > 0 &&
          link.episode <= 100000
        )
          ordinals.add(Number(link.episode));
  }
  const timestamp = now();
  for (const row of access.results)
    if (Number(row.first_seen_at) > timestamp)
      ordinals.delete(Number(row.episode));
  const accessByEpisode = new Map(
    access.results.map((row) => [Number(row.episode), row]),
  );
  const episodes = [...ordinals]
    .sort((a, b) => a - b)
    .slice(0, 200)
    .map((ordinal) => {
      const row = accessByEpisode.get(ordinal);
      const known =
        row &&
        Number.isFinite(Number(row.free_at)) &&
        Number(row.first_seen_at) <= timestamp;
      return {
        ordinal,
        access: !known
          ? ('unknown' as const)
          : Number(row.free_at) > timestamp
            ? ('plus' as const)
            : ('free' as const),
      };
    });
  const checked = allowed
    .map((row) => row.checkedAt)
    .filter((x) => x > 0 && x <= timestamp);
  return {
    status: 'cached',
    total: ordinals.size,
    episodes,
    voiceovers: voices.map((voice) => ({
      title: voice.title,
      type: voice.translation_type === 'subtitles' ? 'subtitles' : 'voice',
    })),
    updatedAt: checked.length ? Math.min(...checked) : undefined,
  };
}

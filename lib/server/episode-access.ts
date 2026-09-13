import { db, now, premium, runtime } from './core';
import { FREE_EPISODE_DELAY_MS } from './plus';

export async function earlyAccessInitialized() {
  const row = await db()
    .prepare(
      "SELECT value FROM plus_system_state WHERE key='episode_bootstrap'",
    )
    .first<{ value: string }>();
  return row?.value === 'complete';
}

export async function bootstrapEpisodes() {
  const rows = await db()
    .prepare("SELECT id,episodes FROM anime_cache WHERE episodes<>'[]'")
    .all();
  const timestamp = now();
  const statements = rows.results.flatMap((row: any) => {
    let episodes: { ordinal: number }[] = [];
    try {
      episodes = JSON.parse(String(row.episodes));
    } catch {}
    return episodes.map((episode) =>
      db()
        .prepare(
          "INSERT INTO episode_availability(anime_id,provider,episode,first_seen_at,free_at) VALUES (?,'aniliberty',?,?,?) ON CONFLICT DO NOTHING",
        )
        .bind(Number(row.id), Number(episode.ordinal), timestamp, timestamp),
    );
  });
  statements.push(
    db()
      .prepare(
        "INSERT INTO plus_system_state(key,value,updated_at) VALUES ('episode_bootstrap','complete',?) ON CONFLICT(key) DO UPDATE SET value='complete',updated_at=excluded.updated_at",
      )
      .bind(timestamp),
  );
  await db().batch(statements);
  return statements.length - 1;
}

export async function syncEpisodeAccess(
  animeId: number,
  provider: string,
  ordinals: number[],
) {
  const timestamp = now(),
    initialized = await earlyAccessInitialized();
  const delay =
    runtime().PLUS_EARLY_ACCESS_ENABLED === 'true' && initialized
      ? FREE_EPISODE_DELAY_MS
      : 0;
  await db().batch(
    ordinals.map((episode) =>
      db()
        .prepare(
          'INSERT INTO episode_availability(anime_id,provider,episode,first_seen_at,free_at) VALUES (?,?,?,?,?) ON CONFLICT DO NOTHING',
        )
        .bind(animeId, provider, episode, timestamp, timestamp + delay),
    ),
  );
  const rows = await db()
    .prepare(
      'SELECT episode,first_seen_at,free_at FROM episode_availability WHERE anime_id=? AND provider=?',
    )
    .bind(animeId, provider)
    .all();
  return new Map(
    rows.results.map((row: any) => [
      Number(row.episode),
      {
        firstSeenAt: Number(row.first_seen_at),
        freeAt: Number(row.free_at),
      },
    ]),
  );
}

export async function canWatchEpisode(
  userId: string | undefined,
  freeAt: number,
) {
  if (freeAt <= now()) return true;
  return !!userId && (await premium(userId)) > now();
}

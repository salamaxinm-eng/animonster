import { db, now, premium, runtime } from './core';
import {
  bootstrapEpisodes,
  earlyAccessInitialized,
  syncEpisodeAccess,
} from './episode-access';
import { liberty, normalize, type Release } from './anime';

async function telegram(chatId: number, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${runtime().TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok) throw new Error(`Telegram HTTP ${response.status}`);
}

export async function runPlusWorker(limit = 20) {
  if (!(await earlyAccessInitialized())) await bootstrapEpisodes();
  const [subscribedRows, recentRows] = await Promise.all([
    db()
      .prepare(
        `SELECT DISTINCT a.id,a.data FROM anime_cache a
         JOIN telegram_subscriptions s ON s.anime_id=a.id ORDER BY a.id LIMIT ?`,
      )
      .bind(Math.max(limit, 100))
      .all(),
    db()
      .prepare(
        'SELECT id,data FROM anime_cache ORDER BY updated_at DESC LIMIT ?',
      )
      .bind(limit)
      .all(),
  ]);
  const cached = new Map<number, any>();
  for (const row of [...subscribedRows.results, ...recentRows.results] as any[])
    cached.set(Number(row.id), row);
  let discovered = 0,
    scanFailed = 0;
  for (const row of cached.values()) {
    let anime: any;
    try {
      anime = JSON.parse(String(row.data));
    } catch {
      continue;
    }
    if (!anime.release_id) continue;
    try {
      const release: Release = await liberty(
          '/anime/releases/' + anime.release_id,
        ),
        normalized = normalize(release);
      const ordinals = (release.episodes || [])
        .filter(
          (episode) => episode.hls_480 || episode.hls_720 || episode.hls_1080,
        )
        .map((episode) => episode.ordinal);
      const before = await db()
        .prepare(
          "SELECT episode FROM episode_availability WHERE anime_id=? AND provider='aniliberty'",
        )
        .bind(normalized.id)
        .all();
      const known = new Set(
        before.results.map((item: any) => Number(item.episode)),
      );
      const access = await syncEpisodeAccess(
        normalized.id,
        'aniliberty',
        ordinals,
      );
      for (const episode of ordinals.filter((number) => !known.has(number))) {
        discovered++;
        const subscribers = await db()
          .prepare(
            `SELECT s.user_id,s.title,s.created_at FROM telegram_subscriptions s
           WHERE s.anime_id=? AND (
             EXISTS(SELECT 1 FROM grants g WHERE g.user_id=s.user_id AND g.revoked_at IS NULL AND g.expires>?)
             OR (SELECT count(*) FROM telegram_subscriptions earlier
                 WHERE earlier.user_id=s.user_id AND
                 (earlier.created_at<s.created_at OR (earlier.created_at=s.created_at AND earlier.anime_id<=s.anime_id)))<=3
           )`,
          )
          .bind(normalized.id, now())
          .all();
        for (const subscriber of subscribers.results as any[]) {
          const plus = await premium(subscriber.user_id),
            availableAt = plus ? now() : access.get(episode)?.freeAt || now();
          await db()
            .prepare(`INSERT INTO telegram_deliveries(id,user_id,anime_id,episode,available_at,next_attempt_at)
            VALUES (?,?,?,?,?,?) ON CONFLICT(user_id,anime_id,episode) DO NOTHING`)
            .bind(
              crypto.randomUUID(),
              subscriber.user_id,
              normalized.id,
              episode,
              availableAt,
              availableAt,
            )
            .run();
        }
      }
    } catch (error) {
      scanFailed++;
      console.error(
        JSON.stringify({
          event: 'plus_episode_scan_failed',
          animeId: row.id,
          error: String(error),
        }),
      );
    }
  }
  let sent = 0,
    failed = 0;
  if (runtime().TELEGRAM_BOT_TOKEN) {
    const jobs = await db()
      .prepare(`SELECT d.*,a.telegram_id,s.title FROM telegram_deliveries d
      JOIN telegram_accounts a ON a.user_id=d.user_id JOIN telegram_subscriptions s ON s.user_id=d.user_id AND s.anime_id=d.anime_id
      WHERE d.status IN ('pending','retry') AND d.next_attempt_at<=? AND a.telegram_id IS NOT NULL AND a.disabled_at IS NULL ORDER BY d.next_attempt_at LIMIT 50`)
      .bind(now())
      .all();
    for (const job of jobs.results as any[]) {
      try {
        const claimed = await db()
          .prepare(
            "UPDATE telegram_deliveries SET status='sending' WHERE id=? AND status IN ('pending','retry') RETURNING id",
          )
          .bind(job.id)
          .first();
        if (!claimed) continue;
        await telegram(
          Number(job.telegram_id),
          `Новая серия на AniMonster: ${job.title} — серия ${job.episode}\n${runtime().SITE_URL || 'https://animonster.su'}/anime/${job.anime_id}?episode=${job.episode}`,
        );
        await db()
          .prepare(
            "UPDATE telegram_deliveries SET status='sent',sent_at=?,attempts=attempts+1 WHERE id=?",
          )
          .bind(now(), job.id)
          .run();
        sent++;
      } catch (error) {
        const blocked = String(error).includes('Telegram HTTP 403');
        await db().batch([
          db()
            .prepare(
              'UPDATE telegram_deliveries SET status=?,attempts=attempts+1,next_attempt_at=?,last_error=? WHERE id=?',
            )
            .bind(
              blocked ? 'disabled' : 'retry',
              now() + Math.min(3600000, 60000 * 2 ** Number(job.attempts || 0)),
              String(error).slice(0, 300),
              job.id,
            ),
          ...(blocked
            ? [
                db()
                  .prepare(
                    'UPDATE telegram_accounts SET disabled_at=? WHERE user_id=?',
                  )
                  .bind(now(), job.user_id),
              ]
            : []),
        ]);
        failed++;
      }
    }
  }
  return {
    ok: true,
    checked: cached.size,
    discovered,
    scan_failed: scanFailed,
    sent,
    failed,
  };
}

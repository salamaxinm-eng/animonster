import { ApiError, db, now, uid } from './core';
import { parseTitleRestrictionLinks } from '../title-restriction-input';

export async function listTitleRestrictions() {
  return (
    await db()
      .prepare(`SELECT r.anime_id,r.source_url,r.reason,r.created_at,r.updated_at,
    COALESCE(c.data::jsonb->>'russian',c.data::jsonb->>'name','Аниме #' || r.anime_id::text) AS title
    FROM title_region_restrictions r LEFT JOIN anime_cache c ON c.id=r.anime_id
    ORDER BY r.updated_at DESC,r.anime_id`)
      .all()
  ).results;
}

export async function saveTitleRestrictions(
  actorId: string,
  links: unknown,
  rawReason: unknown,
) {
  let titles: ReturnType<typeof parseTitleRestrictionLinks>;
  try {
    titles = parseTitleRestrictionLinks(links);
  } catch (error) {
    throw new ApiError((error as Error).message);
  }
  const reason = typeof rawReason === 'string' ? rawReason.trim() : '';
  if (reason.length > 500)
    throw new ApiError('Примечание — не более 500 символов.');
  const stamp = now();
  await db().transaction(async (tx) => {
    for (const title of titles) {
      await tx
        .prepare(`INSERT INTO title_region_restrictions
        (anime_id,source_url,reason,created_by,updated_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(anime_id) DO UPDATE SET
        source_url=excluded.source_url,reason=excluded.reason,
        updated_by=excluded.updated_by,updated_at=excluded.updated_at`)
        .bind(
          title.animeId,
          title.sourceUrl,
          reason,
          actorId,
          actorId,
          stamp,
          stamp,
        )
        .run();
      await tx
        .prepare(`INSERT INTO moderation_actions
        (id,actor_id,action,reason,metadata,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(
          uid(),
          actorId,
          'title.restrict_ru',
          reason,
          JSON.stringify(title),
          stamp,
        )
        .run();
    }
  });
  return { ok: true, count: titles.length };
}

export async function removeTitleRestriction(actorId: string, rawId: unknown) {
  const animeId = Number(rawId);
  if (!Number.isInteger(animeId) || animeId < 1 || animeId > 999999999)
    throw new ApiError('Некорректный ID тайтла.');
  await db().transaction(async (tx) => {
    const previous = await tx
      .prepare(
        'DELETE FROM title_region_restrictions WHERE anime_id=? RETURNING anime_id,source_url,reason',
      )
      .bind(animeId)
      .first();
    if (previous)
      await tx
        .prepare(`INSERT INTO moderation_actions
      (id,actor_id,action,reason,metadata,created_at) VALUES (?,?,?,?,?,?)`)
        .bind(
          uid(),
          actorId,
          'title.unrestrict_ru',
          '',
          JSON.stringify(previous),
          now(),
        )
        .run();
  });
  return { ok: true };
}

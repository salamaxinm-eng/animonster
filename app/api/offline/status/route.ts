import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
} from '@/lib/server/core';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await requireUser(request);
    const input = (await body(request)) as Record<string, unknown>;
    const id = String(input.downloadId || '');
    const status = String(input.status || '');
    if (
      !/^[a-f0-9-]{36}$/i.test(id) ||
      !['completed', 'deleted', 'failed'].includes(status)
    )
      throw new ApiError('Некорректный статус загрузки.');
    await db()
      .prepare(
        "UPDATE offline_downloads SET status=?,updated_at=?,completed_at=CASE WHEN ?='completed' THEN ? ELSE completed_at END WHERE id=? AND user_id=?",
      )
      .bind(status, now(), status, now(), id, user.id)
      .run();
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}

import { ApiError, db, now } from './core';
import { demoCatalog } from './player-demo';
import {
  feedbackEligible,
  mergeCoverage,
  FEEDBACK_SNOOZE,
  type DemoCoverage,
} from '../demo-feedback';

type FeedbackRow = {
  watched: DemoCoverage;
  submitted_at: number | null;
  dismissed_until: number;
};
export async function feedbackStatus(subject: string) {
  const catalog = await demoCatalog();
  if (!catalog) throw new ApiError('Демо недоступно', 404);
  const row = await db()
    .prepare(
      'SELECT watched,submitted_at,dismissed_until FROM demo_player_feedback WHERE subject=?',
    )
    .bind(subject)
    .first<FeedbackRow>();
  const watched = mergeCoverage({}, row?.watched || {}, catalog.episodes);
  return {
    watched,
    eligible: feedbackEligible(watched, catalog.episodes),
    submitted: !!row?.submitted_at,
    dismissedUntil: Number(row?.dismissed_until) || 0,
  };
}

export async function changeFeedback(
  subject: string,
  userId: string | null,
  input: Record<string, unknown>,
) {
  const catalog = await demoCatalog();
  if (!catalog) throw new ApiError('Демо недоступно', 404);
  const action = input.action;
  if (action === 'submit' && input.comment === undefined) input.comment = '';
  if (!['watch', 'submit', 'dismiss'].includes(String(action)))
    throw new ApiError('Неизвестное действие');
  let incoming: DemoCoverage = {};
  if (action === 'watch') {
    if (
      !input.watched ||
      typeof input.watched !== 'object' ||
      Array.isArray(input.watched)
    )
      throw new ApiError('Некорректная история просмотра');
    try {
      incoming = mergeCoverage({}, input.watched, catalog.episodes);
    } catch {
      throw new ApiError('Некорректные интервалы просмотра');
    }
  }
  if (
    action === 'submit' &&
    (!Number.isInteger(input.score) ||
      Number(input.score) < 1 ||
      Number(input.score) > 10 ||
      typeof input.comment !== 'string' ||
      input.comment.length > 2000)
  )
    throw new ApiError(
      'Выберите оценку от 1 до 10. Комментарий — до 2000 символов.',
    );
  await db().transaction(async (tx) => {
    await tx
      .prepare(
        'INSERT INTO demo_player_feedback(subject,user_id,created_at,updated_at) VALUES (?,?,?,?) ON CONFLICT(subject) DO NOTHING',
      )
      .bind(subject, userId, now(), now())
      .run();
    const row = await tx
      .prepare(
        'SELECT watched,submitted_at,dismissed_until FROM demo_player_feedback WHERE subject=? FOR UPDATE',
      )
      .bind(subject)
      .first<FeedbackRow>();
    if (!row) throw new ApiError('Не удалось сохранить отзыв', 500);
    const watched = mergeCoverage(row.watched, incoming, catalog.episodes);
    if (action === 'watch') {
      await tx
        .prepare(
          'UPDATE demo_player_feedback SET watched=?::text::jsonb,updated_at=? WHERE subject=?',
        )
        .bind(JSON.stringify(watched), now(), subject)
        .run();
    } else {
      if (!feedbackEligible(watched, catalog.episodes))
        throw new ApiError(
          'Форма откроется после просмотра 70% трёх серий',
          403,
        );
      if (action === 'submit' && !row.submitted_at)
        await tx
          .prepare(
            'UPDATE demo_player_feedback SET score=?,comment=?,submitted_at=?,updated_at=? WHERE subject=?',
          )
          .bind(
            input.score,
            String(input.comment).trim(),
            now(),
            now(),
            subject,
          )
          .run();
      if (action === 'dismiss' && !row.submitted_at)
        await tx
          .prepare(
            'UPDATE demo_player_feedback SET dismissed_until=?,updated_at=? WHERE subject=?',
          )
          .bind(now() + FEEDBACK_SNOOZE, now(), subject)
          .run();
    }
  });
  return feedbackStatus(subject);
}

export async function feedbackResults(offset = 0) {
  const summary = await db()
    .prepare(
      'SELECT count(*) AS count,avg(score) AS average FROM demo_player_feedback WHERE submitted_at IS NOT NULL',
    )
    .first<{ count: number; average: number | null }>();
  const rows = await db()
    .prepare(
      `SELECT f.score,f.comment,f.submitted_at AS "submittedAt",u.nick FROM demo_player_feedback f LEFT JOIN users u ON u.id=f.user_id WHERE f.submitted_at IS NOT NULL ORDER BY f.submitted_at DESC,f.subject LIMIT 51 OFFSET ?`,
    )
    .bind(offset)
    .all<{
      score: number;
      comment: string;
      submittedAt: number;
      nick: string | null;
    }>();
  return {
    count: Number(summary?.count) || 0,
    average: summary?.average ? Number(summary.average) : null,
    items: rows.results
      .slice(0, 50)
      .map((row) => ({ ...row, submittedAt: Number(row.submittedAt) })),
    hasMore: rows.results.length > 50,
  };
}

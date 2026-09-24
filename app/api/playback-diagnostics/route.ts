import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  sameOrigin,
  uid,
  viewer,
} from '@/lib/server/core';
import { normalizePlaybackDiagnostic } from '@/lib/playback-diagnostics';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const user = await viewer(request);
    if (!user) return json({ ok: true });
    const diagnostic = normalizePlaybackDiagnostic(await body(request));
    if (!diagnostic)
      throw new ApiError('Некорректная диагностика', 400, 'invalid_diagnostic');
    const timestamp = now();
    const recent = await db()
      .prepare(
        'SELECT count(*) AS count FROM playback_diagnostics WHERE user_id=? AND created_at>?',
      )
      .bind(user.id, timestamp - 10 * 60 * 1000)
      .first<{ count: number }>();
    if (Number(recent?.count || 0) >= 20) return json({ ok: true });
    const id = uid();
    await db().batch([
      db()
        .prepare('DELETE FROM playback_diagnostics WHERE created_at<?')
        .bind(timestamp - 30 * 24 * 60 * 60 * 1000),
      db()
        .prepare(
          'INSERT INTO playback_diagnostics(id,user_id,provider,anime_id,episode,voiceover,code,phase,details,user_agent,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        )
        .bind(
          id,
          user.id,
          diagnostic.provider,
          diagnostic.animeId,
          diagnostic.episode,
          diagnostic.voiceover,
          diagnostic.code,
          diagnostic.phase,
          JSON.stringify(diagnostic.details),
          String(request.headers.get('user-agent') || '').slice(0, 500),
          timestamp,
        ),
    ]);
    console.warn(
      JSON.stringify({
        event: 'playback_diagnostic',
        diagnosticId: id,
        userId: user.id,
        provider: diagnostic.provider,
        animeId: diagnostic.animeId,
        episode: diagnostic.episode,
        voiceover: diagnostic.voiceover,
        code: diagnostic.code,
        phase: diagnostic.phase,
        details: diagnostic.details,
      }),
    );
    return json({ ok: true, id });
  } catch (error) {
    return fail(error);
  }
}

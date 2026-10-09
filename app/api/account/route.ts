import {
  ApiError,
  body,
  db,
  fail,
  json,
  now,
  requireUser,
  sameOrigin,
  uid,
} from '@/lib/server/core';
import { revokeVpnDevice } from '@/lib/server/vpn';

export async function GET(r: Request) {
  try {
    const user = await requireUser(r);
    const [profile, collection, lists, listItems, history, comments, vpnSubscription, vpnDevices] =
      await Promise.all([
        db()
          .prepare(
            'SELECT id,email,nick,bio,role,created_at,adult_confirmed_at FROM users WHERE id=?',
          )
          .bind(user.id)
          .first(),
        db()
          .prepare(
            'SELECT anime_id,title,status,rating,favorite FROM collection WHERE user_id=? ORDER BY title',
          )
          .bind(user.id)
          .all(),
        db()
          .prepare(
            'SELECT id,name,created_at FROM collection_lists WHERE user_id=? ORDER BY created_at',
          )
          .bind(user.id)
          .all(),
        db()
          .prepare(
            'SELECT i.list_id,i.anime_id FROM collection_list_items i JOIN collection_lists l ON l.id=i.list_id WHERE l.user_id=? ORDER BY i.list_id,i.anime_id',
          )
          .bind(user.id)
          .all(),
        db()
          .prepare(
            'SELECT anime_id,episode,voiceover,position,duration,completed,updated_at FROM history WHERE user_id=? ORDER BY updated_at DESC',
          )
          .bind(user.id)
          .all(),
        db()
          .prepare(
            'SELECT id,scope,body,created_at,edited_at,deleted FROM comments WHERE author_id=? ORDER BY created_at DESC',
          )
          .bind(user.id)
          .all(),
        db().prepare('SELECT expires_at,granted_at FROM vpn_subscriptions WHERE user_id=?')
          .bind(user.id).first(),
        db().prepare('SELECT id,name,status,created_at,revoked_at FROM vpn_devices WHERE user_id=? ORDER BY created_at DESC')
          .bind(user.id).all(),
      ]);
    return new Response(
      JSON.stringify(
        {
          exported_at: new Date().toISOString(),
          profile,
          collection: collection.results,
          lists: lists.results,
          list_items: listItems.results,
          history: history.results,
          comments: comments.results,
          vpn_subscription: vpnSubscription,
          vpn_devices: vpnDevices.results,
        },
        null,
        2,
      ),
      {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': 'attachment; filename="animonster-data.json"',
          'Cache-Control': 'no-store',
        },
      },
    );
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(r: Request) {
  try {
    sameOrigin(r);
    const user = await requireUser(r);
    const b = await body(r);
    if (b.confirmation !== 'УДАЛИТЬ')
      throw new ApiError('Введите УДАЛИТЬ для подтверждения.');
    const vpnDevices = await db().prepare(`SELECT id FROM vpn_devices
      WHERE user_id=? AND status<>'revoked'`).bind(user.id).all<{ id: string }>();
    for (const device of vpnDevices.results)
      await revokeVpnDevice(user.id, device.id);
    await db().prepare('UPDATE vpn_subscriptions SET expires_at=?,updated_at=? WHERE user_id=?')
      .bind(now(), now(), user.id).run();
    const anonymous = `deleted:${uid()}`;
    await db().batch([
      db().prepare('DELETE FROM sessions WHERE user_id=?').bind(user.id),
      db().prepare('DELETE FROM email_tokens WHERE user_id=?').bind(user.id),
      db().prepare('DELETE FROM auth_identities WHERE user_id=?').bind(user.id),
      db()
        .prepare('DELETE FROM collection_lists WHERE user_id=?')
        .bind(user.id),
      db().prepare('DELETE FROM collection WHERE user_id=?').bind(user.id),
      db().prepare('DELETE FROM user_avatars WHERE user_id=?').bind(user.id),
      db().prepare('DELETE FROM plus_assets WHERE user_id=?').bind(user.id),
      db()
        .prepare('DELETE FROM profile_anime_showcase WHERE user_id=?')
        .bind(user.id),
      db()
        .prepare('DELETE FROM profile_character_showcase WHERE user_id=?')
        .bind(user.id),
      db()
        .prepare('DELETE FROM comment_reactions WHERE user_id=?')
        .bind(user.id),
      db()
        .prepare('DELETE FROM telegram_deliveries WHERE user_id=?')
        .bind(user.id),
      db()
        .prepare('DELETE FROM telegram_subscriptions WHERE user_id=?')
        .bind(user.id),
      db()
        .prepare('DELETE FROM telegram_accounts WHERE user_id=?')
        .bind(user.id),
      db().prepare('DELETE FROM history WHERE user_id=?').bind(user.id),
      db().prepare('DELETE FROM likes WHERE user_id=?').bind(user.id),
      db()
        .prepare('DELETE FROM blocks WHERE user_id=? OR target_id=?')
        .bind(user.id, user.id),
      db()
        .prepare(
          "UPDATE users SET identity=?,email=NULL,password_hash=NULL,nick=?,bio=?,avatar=?,pin=NULL,profile_background=NULL,profile_frame='none',adult_confirmed_at=NULL,deleted_at=? WHERE id=?",
        )
        .bind(
          anonymous,
          `Удалённый_${user.id.slice(0, 8)}`,
          '',
          'moon',
          now(),
          user.id,
        ),
    ]);
    return json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}

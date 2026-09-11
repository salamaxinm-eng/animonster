import {
  db,
  runtime,
  base,
  hash,
  uid,
  now,
  cookie,
} from '@/lib/server/core';
export async function GET(r: Request) {
  try {
    const q = new URL(r.url).searchParams,
      state = q.get('state'),
      code = q.get('code'),
      device = q.get('device_id'),
      client = runtime().VK_CLIENT_ID;
    if (!state || !code || !device || !client)
      throw Error('Missing callback fields');
    const flow = await db()
      .prepare(
        'DELETE FROM auth_flows WHERE state=? AND browser_hash=? AND expires>? RETURNING verifier,invite_hash',
      )
      .bind(state, await hash(cookie(r, 'am_oauth')), now())
      .first<{ verifier: string; invite_hash: string | null }>();
    if (!flow) throw Error('Invalid state');
    const exchange = new URLSearchParams({
      grant_type: 'authorization_code',
      redirect_uri: base() + '/api/auth/vk/callback',
      client_id: client,
      code_verifier: flow.verifier,
      state,
      device_id: device,
      code,
    });
    const tokenResponse = await fetch('https://id.vk.ru/oauth2/auth', {
      method: 'POST',
      body: exchange,
      signal: AbortSignal.timeout(15000),
    });
    const token = (await tokenResponse.json()) as {
      access_token?: string;
      state?: string;
    };
    if (!tokenResponse.ok || !token.access_token || token.state !== state)
      throw Error('Token exchange rejected');
    const response = await fetch(
      'https://id.vk.ru/oauth2/user_info?client_id=' +
        encodeURIComponent(client),
      {
        method: 'POST',
        body: new URLSearchParams({ access_token: token.access_token }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data = (await response.json()) as {
      user?: { user_id?: string | number; first_name?: string };
    };
    if (!response.ok || !data.user?.user_id) throw Error('User info rejected');
    const identity = 'vk:' + data.user.user_id;
    const isConfiguredAdmin = String(data.user.user_id) === runtime().ADMIN_VK_USER_ID;
    let u = await db().prepare('SELECT id FROM users WHERE identity=?').bind(identity).first<{ id: string }>();
    if (!u) {
      const id = uid();
      const firstName = (data.user.first_name || 'Monster').replace(/[^\p{L}\p{N}_-]/gu, '').slice(0, 14) || 'Monster';
      if (isConfiguredAdmin) {
        u = await db().prepare('INSERT INTO users(id,identity,nick,email_verified,role,created_at) VALUES (?,?,?,1,?,?) RETURNING id')
          .bind(id, identity, `${firstName}_${id.slice(0, 8)}`, 'admin', now()).first<{ id: string }>();
      } else {
        if (!flow.invite_hash) return Response.redirect(base() + '/profile?auth=invite_required', 302);
        u = await db().prepare(
          `WITH claimed AS (
            UPDATE invites SET used_by=?,used_at=? WHERE hash=? AND used_by IS NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>?) RETURNING hash
          ) INSERT INTO users(id,identity,nick,email_verified,created_at)
            SELECT ?,?,?,1,? FROM claimed RETURNING id`,
        ).bind(id, now(), flow.invite_hash, now(), id, identity, `${firstName}_${id.slice(0, 8)}`, now()).first<{ id: string }>();
      }
      if (!u) return Response.redirect(base() + '/profile?auth=invite_invalid', 302);
      await db().prepare('INSERT INTO auth_identities(provider,provider_user_id,user_id,created_at) VALUES (?,?,?,?)')
        .bind('vk', String(data.user.user_id), u.id, now()).run();
    } else if (isConfiguredAdmin) {
      await db().prepare("UPDATE users SET role='admin' WHERE id=?").bind(u.id).run();
    }
    const session = uid() + uid();
    await db().batch([
      db().prepare('DELETE FROM sessions WHERE expires<?').bind(now()),
      db()
        .prepare('INSERT INTO sessions(hash,user_id,created_at,last_seen_at,expires) VALUES (?,?,?,?,?)')
        .bind(await hash(session), u.id, now(), now(), now() + 2592000000),
    ]);
    const h = new Headers({
      Location: base() + '/profile',
      'Cache-Control': 'no-store',
    });
    h.append(
      'Set-Cookie',
      `am_session=${session}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`,
    );
    h.append(
      'Set-Cookie',
      'am_oauth=; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/vk; Max-Age=0',
    );
    return new Response(null, { status: 302, headers: h });
  } catch {
    return Response.redirect(base() + '/profile?auth=failed', 302);
  }
}

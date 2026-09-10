import { db, runtime, base, hash, uid, now, json } from '@/lib/server/core';
export async function GET() {
  const client = runtime().VK_CLIENT_ID;
  if (!client)
    return json(
      {
        error:
          'Вход через VK ещё настраивается. Приложение VK ID пока не подключено.',
      },
      503,
    );
  const state = uid(),
    browser = uid() + uid(),
    verifier = (uid() + uid()).replaceAll('-', '');
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  const challenge = btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
  await db().batch([
    db().prepare('DELETE FROM auth_flows WHERE expires<?').bind(now()),
    db()
      .prepare(
        'INSERT INTO auth_flows(state,browser_hash,verifier,expires) VALUES (?,?,?,?)',
      )
      .bind(state, await hash(browser), verifier, now() + 600000),
  ]);
  const query = new URLSearchParams({
    client_id: client,
    response_type: 'code',
    redirect_uri: base() + '/api/auth/vk/callback',
    state,
    code_challenge: challenge,
    code_challenge_method: 's256',
    scope: 'vkid.personal_info',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: 'https://id.vk.ru/authorize?' + query,
      'Set-Cookie': `am_oauth=${browser}; HttpOnly; Secure; SameSite=Lax; Path=/api/auth/vk; Max-Age=600`,
      'Cache-Control': 'no-store',
    },
  });
}

import {
  db,
  viewer,
  cookie,
  hash,
  uid,
  now,
  sameOrigin,
  fail,
} from '@/lib/server/core';
export async function actor(r: Request) {
  const user = await viewer(r),
    supplied = cookie(r, 'am_visitor');
  const visitor = /^[a-f0-9-]{36}$/.test(supplied) ? supplied : uid();
  return {
    user,
    visitor,
    key: user ? 'u:' + user.id : 'v:' + (await hash(visitor)),
  };
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const a = await actor(r);
    await db()
      .prepare('INSERT OR IGNORE INTO daily_activity(day,actor) VALUES (?,?)')
      .bind(new Date(now()).toISOString().slice(0, 10), a.key)
      .run();
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'Set-Cookie': `am_visitor=${a.visitor}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${new URL(r.url).protocol === 'https:' ? '; Secure' : ''}`,
      },
    });
  } catch (e) {
    return fail(e);
  }
}

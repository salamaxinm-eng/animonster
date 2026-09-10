/// <reference types="@cloudflare/workers-types" />
import { env } from 'cloudflare:workers';
export type Runtime = {
  DB: D1Database;
  VK_CLIENT_ID?: string;
  ADMIN_VK_USER_ID?: string;
  SITE_URL?: string;
  OWNER_PREVIEW?: string;
  YOOKASSA_SHOP_ID?: string;
  YOOKASSA_SECRET_KEY?: string;
  PAYMENTS_ENABLED?: string;
  KODIK_API_TOKEN?: string;
};
export const runtime = () => env as unknown as Runtime;
export const db = () => runtime().DB;
export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const base = () =>
  runtime().SITE_URL || 'https://animonster.smoky-globe-3735.chatgpt.site';
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError('Нужен JSON', 415);
  const raw = await request.text();
  if (raw.length > 16000) throw new ApiError('Слишком большой запрос', 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('Некорректный запрос');
  }
}
export function sameOrigin(r: Request) {
  const origin = r.headers.get('origin');
  if (!origin || origin !== new URL(r.url).origin)
    throw new ApiError('Запрос с другого сайта отклонён', 403);
}
export function fail(e: unknown) {
  if (e instanceof ApiError) return json({ error: e.message }, e.status);
  console.error(
    'Community request failed',
    e instanceof Error ? e.message : 'unknown',
  );
  return json(
    { error: 'Не удалось выполнить действие. Попробуйте ещё раз.' },
    500,
  );
}
export const hash = async (value: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');
export const cookie = (r: Request, name: string) =>
  r.headers
    .get('cookie')
    ?.split(';')
    .map((x) => x.trim())
    .find((x) => x.startsWith(name + '='))
    ?.slice(name.length + 1) || '';
export type User = {
  role: string;
  id: string;
  identity: string;
  nick: string;
  bio: string;
  theme: string;
  avatar: string;
  pin: string | null;
  wall_open: number;
  collection_public: number;
  created_at: number;
};
export async function ensureUser(identity: string, nick = 'Monster') {
  const found = await db()
    .prepare('SELECT * FROM users WHERE identity=?')
    .bind(identity)
    .first<User>();
  if (found) return found;
  const id = uid();
  await db()
    .prepare(
      'INSERT OR IGNORE INTO users (id,identity,nick,created_at) VALUES (?,?,?,?)',
    )
    .bind(id, identity, nick.slice(0, 18) + '_' + id.slice(0, 8), now())
    .run();
  return (await db()
    .prepare('SELECT * FROM users WHERE identity=?')
    .bind(identity)
    .first<User>())!;
}
export async function viewer(r: Request) {
  const token = cookie(r, 'am_session');
  if (token) {
    const u = await db()
      .prepare(
        'SELECT u.* FROM users u JOIN sessions s ON u.id=s.user_id WHERE s.hash=? AND s.expires>?',
      )
      .bind(await hash(token), now())
      .first<User>();
    if (u) return u;
  }
  if (runtime().OWNER_PREVIEW === 'true') {
    const owner = r.headers.get('oai-authenticated-user-id');
    if (owner) {
      const user = await ensureUser(
        'preview:' + (await hash(owner)),
        'AniMonster',
      );
      return { ...user, role: 'admin' };
    }
  }
  return null;
}
export async function requireUser(r: Request) {
  const u = await viewer(r);
  if (!u) throw new ApiError('Войдите в аккаунт, чтобы продолжить', 401);
  return u;
}
export async function premium(id: string) {
  const row = await db()
    .prepare('SELECT MAX(expires) AS expires FROM grants WHERE user_id=?')
    .bind(id)
    .first<{ expires: number | null }>();
  return row?.expires && row.expires > now() ? row.expires : 0;
}
export async function publicUser(u: User) {
  const until = await premium(u.id);
  return {
    id: u.id,
    nick: u.nick,
    bio: u.bio,
    theme: u.theme,
    avatar: u.avatar,
    pin: until ? u.pin : null,
    wall_open: u.wall_open,
    collection_public: u.collection_public,
    created_at: u.created_at,
    premium_until: until,
  };
}

export const isModerator = (u: User | null) =>
  !!u &&
  (['admin', 'moderator'].includes(u.role) ||
    (!!runtime().ADMIN_VK_USER_ID &&
      u.identity === 'vk:' + runtime().ADMIN_VK_USER_ID));

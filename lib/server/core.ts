import postgres from 'postgres';

export type Runtime = {
  DATABASE_URL?: string;
  VK_CLIENT_ID?: string;
  VK_CLIENT_SECRET?: string;
  ADMIN_VK_USER_ID?: string;
  SITE_URL?: string;
  OWNER_PREVIEW?: string;
  PAYMENTS_ENABLED?: string;
  PLATEGA_MERCHANT_ID?: string;
  PLATEGA_SECRET_KEY?: string;
  KODIK_API_TOKEN?: string;
  KODIK_SYNC_ENABLED?: string;
  KODIK_CATALOG_ENABLED?: string;
  ANILIBERTY_API_URL?: string;
  RECOMMENDATION_CRON_SECRET?: string;
  UNISENDER_API_KEY?: string;
  EMAIL_FROM?: string;
  TELEGRAM_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_BOT_USERNAME?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  PLUS_EARLY_ACCESS_ENABLED?: string;
  INVITE_REQUIRED?: string;
  EMAIL_VERIFICATION_ENABLED?: string;
  MEDIA_PROXY_ENABLED?: string;
  MEDIA_PROXY_SECRET?: string;
  MEDIA_PROXY_HOSTS?: string;
};

export const runtime = () => process.env as Runtime;
type QueryResult<T> = { results: T[] };
type RunResult = { success: boolean; meta: { changes: number } };

function pgQuery(source: string) {
  let parameter = 0;
  let query = source.replace(/\?/g, () => `$${++parameter}`);
  if (/^\s*INSERT\s+OR\s+IGNORE\s+/i.test(query)) {
    query = query.replace(/^\s*INSERT\s+OR\s+IGNORE\s+/i, 'INSERT ');
    const returning = query.match(/\s+RETURNING\s+/i);
    if (returning?.index !== undefined)
      query = `${query.slice(0, returning.index)} ON CONFLICT DO NOTHING${query.slice(returning.index)}`;
    else query += ' ON CONFLICT DO NOTHING';
  }
  return query;
}

class PreparedStatement {
  private values: unknown[] = [];
  constructor(
    readonly source: string,
    private readonly connection: any,
  ) {}
  bind(...values: unknown[]) {
    this.values = values;
    return this;
  }
  private execute() {
    return this.connection.unsafe(pgQuery(this.source), this.values);
  }
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    const rows = await this.execute();
    return (rows[0] as T | undefined) ?? null;
  }
  async all<T = Record<string, unknown>>(): Promise<QueryResult<T>> {
    const rows = await this.execute();
    return { results: [...rows] as T[] };
  }
  async run(): Promise<RunResult> {
    const rows = await this.execute();
    return { success: true, meta: { changes: rows.count ?? rows.length } };
  }
  async executeWith(connection: any) {
    const rows = await connection.unsafe(pgQuery(this.source), this.values);
    return { success: true, meta: { changes: rows.count ?? rows.length } };
  }
}

class Database {
  constructor(private readonly connection: any) {}
  prepare(query: string) {
    return new PreparedStatement(query, this.connection);
  }
  async batch(statements: PreparedStatement[]) {
    return this.connection.begin(async (transaction: any) => {
      const results = [];
      for (const statement of statements)
        results.push(await statement.executeWith(transaction));
      return results;
    });
  }
}

let database: Database | undefined;
async function localPostgres() {
  const [{ PGlite }, { readFile, readdir, mkdir }, path] = await Promise.all([
    import('@electric-sql/pglite'),
    import('node:fs/promises'),
    import('node:path'),
  ]);
  await mkdir('.data', { recursive: true });
  const engine = new PGlite('.data/animonster');
  await engine.waitReady;
  const existing = await engine.query(
    "SELECT 1 FROM pg_tables WHERE schemaname='public' AND tablename='users'",
  );
  await engine.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at bigint NOT NULL)',
  );
  if (existing.rows.length) {
    await engine.query(
      'INSERT INTO schema_migrations(name,applied_at) VALUES ($1,$2) ON CONFLICT DO NOTHING',
      ['0001_initial.sql', now()],
    );
  }
  const directory = path.resolve('migrations/postgres');
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith('.sql'))
    .sort();
  for (const name of migrations) {
    const applied = await engine.query(
      'SELECT 1 FROM schema_migrations WHERE name=$1',
      [name],
    );
    if (applied.rows.length) continue;
    const migration = await readFile(path.join(directory, name), 'utf8');
    await engine.transaction(async (transaction) => {
      await transaction.exec(migration);
      await transaction.query(
        'INSERT INTO schema_migrations(name,applied_at) VALUES ($1,$2)',
        [name, now()],
      );
    });
  }
  const client = (executor: typeof engine) => ({
    unsafe: async (query: string, values: unknown[] = []) => {
      const result = await executor.query(query, values as never[]);
      const rows = [...result.rows] as Record<string, unknown>[] & {
        count?: number;
      };
      rows.count = result.affectedRows ?? rows.length;
      return rows;
    },
  });
  return {
    ...client(engine),
    begin: (callback: (transaction: unknown) => unknown) =>
      engine.transaction(async (transaction) =>
        callback(client(transaction as unknown as typeof engine)),
      ),
  };
}
export function db() {
  if (!database) {
    const url = runtime().DATABASE_URL;
    if (!url) {
      if (process.env.NODE_ENV === 'production')
        throw new Error('DATABASE_URL is not configured');
      const local = localPostgres();
      database = new Database({
        unsafe: (query: string, values: unknown[]) =>
          local.then((client) => client.unsafe(query, values)),
        begin: (callback: (transaction: unknown) => unknown) =>
          local.then((client) => client.begin(callback)),
      });
    } else
      database = new Database(
        postgres(url, {
          max: Number(process.env.DB_POOL_SIZE || 10),
          idle_timeout: 20,
          connect_timeout: 10,
          prepare: true,
          transform: { undefined: null },
        }),
      );
  }
  return database;
}

export const now = () => Date.now();
export const uid = () => crypto.randomUUID();
export const base = () => runtime().SITE_URL || 'http://localhost:3000';
export const inviteRequired = () => runtime().INVITE_REQUIRED === 'true';
export const emailVerificationEnabled = () =>
  runtime().EMAIL_VERIFICATION_ENABLED === 'true';
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
    public code = 'request_failed',
  ) {
    super(message);
  }
}
export async function body(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new ApiError('Нужен JSON', 415, 'json_required');
  const raw = await request.text();
  if (raw.length > 16000)
    throw new ApiError('Слишком большой запрос', 413, 'body_too_large');
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('Некорректный запрос', 400, 'invalid_json');
  }
}
export function sameOrigin(r: Request) {
  const origin = r.headers.get('origin');
  const host = (
    r.headers.get('x-forwarded-host') ||
    r.headers.get('host') ||
    ''
  )
    .split(',')[0]
    .trim();
  const protocol = (
    r.headers.get('x-forwarded-proto') ||
    new URL(r.url).protocol.replace(':', '')
  )
    .split(',')[0]
    .trim();
  const requestOrigin = host ? `${protocol}://${host}` : new URL(r.url).origin;
  const configuredOrigin = runtime().SITE_URL
    ? new URL(runtime().SITE_URL!).origin
    : null;
  if (!origin || (origin !== requestOrigin && origin !== configuredOrigin))
    throw new ApiError('Запрос с другого сайта отклонён', 403, 'bad_origin');
}
export function fail(e: unknown) {
  const requestId = uid();
  if (e instanceof ApiError)
    return json(
      { error: e.message, code: e.code, request_id: requestId },
      e.status,
    );
  console.error(
    JSON.stringify({
      event: 'request_failed',
      requestId,
      error: e instanceof Error ? e.message : 'unknown',
    }),
  );
  return json(
    {
      error: 'Не удалось выполнить действие. Попробуйте ещё раз.',
      code: 'internal_error',
      request_id: requestId,
    },
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
  email?: string | null;
  email_verified?: number;
  nick: string;
  bio: string;
  theme: string;
  avatar: string;
  pin: string | null;
  wall_open: number;
  collection_public: number;
  adult_confirmed_at?: number | null;
  auto_skip_segments?: number | null;
  profile_background?: string | null;
  profile_frame?: string;
  suspended_until?: number | null;
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
    if (u && (!u.suspended_until || u.suspended_until < now())) return u;
  }
  if (
    process.env.NODE_ENV === 'development' &&
    runtime().OWNER_PREVIEW === 'true'
  ) {
    const owner = 'local-development-owner';
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
  if (!u)
    throw new ApiError(
      'Войдите в аккаунт, чтобы продолжить',
      401,
      'authentication_required',
    );
  if (emailVerificationEnabled() && u.email && !u.email_verified)
    throw new ApiError(
      'Подтвердите email, чтобы использовать эту функцию.',
      403,
      'email_not_verified',
    );
  return u;
}
export async function premium(id: string) {
  const row = await db()
    .prepare(
      'SELECT MAX(expires) AS expires FROM grants WHERE user_id=? AND revoked_at IS NULL',
    )
    .bind(id)
    .first<{ expires: number | null }>();
  return row?.expires && row.expires > now() ? row.expires : 0;
}
export async function publicUser(u: User) {
  const until = await premium(u.id);
  const progress = await db()
    .prepare(
      'SELECT COALESCE(sum(completed),0) AS episodes FROM history WHERE user_id=?',
    )
    .bind(u.id)
    .first<{ episodes: number }>();
  const level = 1 + Math.floor(Number(progress?.episodes || 0) / 10);
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
    level,
    entitlements: {
      can_change_avatar: !!until || level >= 5,
      custom_list_limit: until ? 20 : 3,
      telegram_title_limit: until ? null : 3,
      can_customize_lists: !!until,
      can_customize_profile: !!until,
      can_react: !!until,
      early_access: !!until,
    },
    profile_background: until ? u.profile_background || null : null,
    profile_frame: until ? u.profile_frame || 'none' : 'none',
    adult_confirmed: !!u.adult_confirmed_at,
    auto_skip_segments:
      u.auto_skip_segments == null ? null : !!u.auto_skip_segments,
    email_verified:
      !emailVerificationEnabled() || !u.email || !!u.email_verified,
  };
}
export const isModerator = (u: User | null) =>
  !!u &&
  (['admin', 'moderator'].includes(u.role) ||
    (!!runtime().ADMIN_VK_USER_ID &&
      u.identity === 'vk:' + runtime().ADMIN_VK_USER_ID));

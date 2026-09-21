import { ApiError, db, now, premium } from './core';

export type CosmeticKind = 'tag' | 'pin' | 'frame';
export type CosmeticAccess =
  | 'free'
  | 'plus'
  | 'achievement'
  | 'referral'
  | 'purchase'
  | 'admin';

export type Cosmetic = {
  id: string;
  kind: CosmeticKind;
  slug: string;
  name: string;
  description: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  image: string | null;
  style_json: Record<string, unknown> | null;
  access_type: CosmeticAccess;
  active: number;
  sort_order: number;
};

function parseCosmetic(row: Cosmetic & { style_json: unknown }): Cosmetic {
  if (typeof row.style_json === 'string') {
    try {
      return { ...row, style_json: JSON.parse(row.style_json) };
    } catch {
      return { ...row, style_json: null };
    }
  }
  return row;
}

export async function cosmeticsCatalog(userId?: string) {
  const [rows, owned, premiumUntil] = await Promise.all([
    db()
      .prepare(
        `SELECT id,kind,slug,name,description,rarity,image,style_json,access_type,active,sort_order
         FROM cosmetics WHERE active=1 ORDER BY kind,sort_order,slug`,
      )
      .all<Cosmetic & { style_json: unknown }>(),
    userId
      ? db()
          .prepare(
            'SELECT cosmetic_id,source,unlocked_at FROM user_cosmetics WHERE user_id=?',
          )
          .bind(userId)
          .all<{
            cosmetic_id: string;
            source: CosmeticAccess;
            unlocked_at: number;
          }>()
      : Promise.resolve({ results: [] }),
    userId ? premium(userId) : Promise.resolve(0),
  ]);
  const inventory = new Map(
    owned.results.map((item) => [item.cosmetic_id, item]),
  );
  return rows.results.map((raw) => {
    const item = parseCosmetic(raw);
    const grant = inventory.get(item.id);
    const unlocked =
      item.access_type === 'free' ||
      (item.access_type === 'plus' && premiumUntil > now()) ||
      (item.access_type !== 'plus' && !!grant);
    return {
      ...item,
      unlocked,
      source: grant?.source || item.access_type,
      unlocked_at: grant?.unlocked_at || null,
      condition:
        item.access_type === 'plus'
          ? 'Активная подписка AniMonster Plus'
          : item.access_type === 'achievement'
            ? 'Награда за достижение'
            : item.access_type === 'referral'
              ? 'Награда за приглашённых друзей'
              : item.access_type === 'purchase'
                ? item.slug === 'number-one'
                  ? 'Текущий лидер рейтинга поддержки'
                  : 'Покупка годового AniMonster Plus'
                : item.access_type === 'admin'
                  ? 'Выдаётся администрацией'
                  : 'Доступно всем',
    };
  });
}

export async function validateEquippedCosmetic(
  userId: string,
  kind: CosmeticKind,
  rawSlug: unknown,
  premiumUntil?: number,
) {
  const slug = String(rawSlug || '').trim();
  if (!slug || (kind === 'frame' && slug === 'none'))
    return kind === 'frame' ? 'none' : null;
  const item = await db()
    .prepare(
      `SELECT id,access_type FROM cosmetics WHERE kind=? AND slug=? AND active=1`,
    )
    .bind(kind, slug)
    .first<{ id: string; access_type: CosmeticAccess }>();
  if (!item)
    throw new ApiError('Неизвестная косметика', 400, 'unknown_cosmetic');
  if (item.access_type === 'free') return slug;
  const until = premiumUntil ?? (await premium(userId));
  if (item.access_type === 'plus') {
    if (until > now()) return slug;
    throw new ApiError(
      'Эта косметика доступна только с активным AniMonster Plus',
      403,
      'cosmetic_locked',
    );
  }
  const owned = await db()
    .prepare('SELECT 1 FROM user_cosmetics WHERE user_id=? AND cosmetic_id=?')
    .bind(userId, item.id)
    .first();
  if (!owned)
    throw new ApiError('Эта награда ещё не получена', 403, 'cosmetic_locked');
  return slug;
}

export async function grantCosmetic(
  userId: string,
  cosmeticSlug: string,
  source: Exclude<CosmeticAccess, 'free' | 'plus'>,
  sourceKey: string,
  metadata: Record<string, unknown> = {},
) {
  const item = await db()
    .prepare('SELECT id FROM cosmetics WHERE slug=? AND active=1')
    .bind(cosmeticSlug)
    .first<{ id: string }>();
  if (!item) throw new Error(`Unknown cosmetic: ${cosmeticSlug}`);
  await db()
    .prepare(
      `INSERT INTO user_cosmetics(user_id,cosmetic_id,unlocked_at,source,source_key,metadata)
       VALUES (?,?,?,?,?,?::jsonb) ON CONFLICT(user_id,cosmetic_id) DO NOTHING`,
    )
    .bind(userId, item.id, now(), source, sourceKey, JSON.stringify(metadata))
    .run();
}

export async function safeEquippedCosmetics(
  userId: string,
  equipped: { tag?: string | null; pin?: string | null; frame?: string | null },
  premiumUntil: number,
) {
  async function safe(kind: CosmeticKind, slug?: string | null) {
    try {
      return await validateEquippedCosmetic(userId, kind, slug, premiumUntil);
    } catch {
      return kind === 'frame' ? 'none' : null;
    }
  }
  const [tag, pin, frame] = await Promise.all([
    safe('tag', equipped.tag),
    safe('pin', equipped.pin),
    safe('frame', equipped.frame),
  ]);
  return { tag, pin, frame };
}

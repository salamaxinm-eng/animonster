import { ApiError, db, now, premium } from './core';

export type CosmeticKind = 'tag' | 'pin' | 'frame' | 'theme' | 'background';
export type CosmeticAccess =
  | 'free'
  | 'plus'
  | 'achievement'
  | 'referral'
  | 'purchase'
  | 'admin'
  | 'founder'
  | 'fundraising';

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
            `SELECT cosmetic_id,source,unlocked_at,
              (source='admin' AND EXISTS(SELECT 1 FROM users u WHERE u.id=user_cosmetics.user_id AND u.role='admin')) AS admin_override
              FROM user_cosmetics WHERE user_id=?`,
          )
          .bind(userId)
          .all<{
            cosmetic_id: string;
            source: CosmeticAccess;
            unlocked_at: number;
            admin_override: boolean;
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
      !!grant?.admin_override ||
      (item.access_type === 'plus' && premiumUntil > now()) ||
      (item.access_type !== 'plus' && !!grant);
    return {
      ...item,
      unlocked,
      source: grant?.source || item.access_type,
      unlocked_at: grant?.unlocked_at || null,
      condition:
        item.access_type === 'fundraising'
          ? item.kind === 'pin' && item.slug === 'player-supporter'
            ? 'Поддержка своего плеера · донат от 150 ₽ или Plus'
            : item.kind === 'pin' && item.slug === 'development-supporter'
              ? 'Поддержка развития AniMonster · донат от 150 ₽ или Plus'
              : 'Поддержка AniMonster · донат от 150 ₽ или Plus'
          : item.access_type === 'plus'
          ? 'Активная подписка AniMonster Plus'
          : item.access_type === 'achievement'
            ? 'Награда за достижение'
            : item.access_type === 'referral'
              ? 'Награда за приглашённых друзей'
              : item.access_type === 'purchase'
                ? ['number-one', 'champion-gold', 'champion-crown'].includes(
                    item.slug,
                  )
                  ? 'Текущий лидер рейтинга поддержки'
                  : 'Покупка годового AniMonster Plus'
                : item.access_type === 'admin'
                  ? 'Выдаётся администрацией'
                  : item.access_type === 'founder'
                    ? 'Только для участников FOUNDING 10'
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
  const adminOwned = await db()
    .prepare("SELECT 1 FROM user_cosmetics c JOIN users u ON u.id=c.user_id WHERE c.user_id=? AND c.cosmetic_id=? AND c.source='admin' AND u.role='admin'")
    .bind(userId, item.id).first();
  if (adminOwned) return slug;
  if (item.access_type === 'founder') {
    const founder = await db().prepare('SELECT founder_number FROM founding_members WHERE user_id=?')
      .bind(userId).first<{ founder_number: number }>();
    if (!founder || (kind === 'pin' && slug !== `founder-${String(founder.founder_number).padStart(3, '0')}`))
      throw new ApiError('Эта награда доступна только Founder', 403, 'cosmetic_locked');
  }
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
  if (source === 'founder' || source === 'fundraising')
    throw new Error('Use confirmed payment reward synchronization');
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

export async function cosmeticEquipValue(kind: CosmeticKind, slug: string | null) {
  if (kind === 'theme') return slug === 'bleach-theme' ? 'bleach' : slug || 'neon';
  if (kind !== 'background' || !slug) return slug;
  const item = await db().prepare("SELECT image FROM cosmetics WHERE kind='background' AND slug=?")
    .bind(slug).first<{ image: string | null }>();
  return item?.image || null;
}

export async function safeProfileBackground(userId: string, value: string | null | undefined, premiumUntil: number) {
  if (!value) return null;
  if (value.startsWith('asset:')) return premiumUntil > now() ? value : null;
  const item = await db().prepare("SELECT slug,image FROM cosmetics WHERE kind='background' AND (slug=? OR image=?) AND active=1")
    .bind(value, value).first<{ slug: string; image: string | null }>();
  if (!item) return null;
  try {
    await validateEquippedCosmetic(userId, 'background', item.slug, premiumUntil);
    return item.image;
  } catch {
    return null;
  }
}

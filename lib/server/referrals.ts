import { base, cookie, db, now, uid } from './core';
import { grantCosmetic } from './cosmetics';
import { grantPlusDays } from './plus';

const REFERRAL_COOKIE = 'am_referral';
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (value) => ALPHABET[value % ALPHABET.length]).join(
    '',
  );
}

export async function ensureReferralCode(userId: string) {
  const existing = await db()
    .prepare('SELECT code FROM referral_codes WHERE user_id=?')
    .bind(userId)
    .first<{ code: string }>();
  if (existing) return existing.code;
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const created = await db()
      .prepare(
        `INSERT INTO referral_codes(user_id,code,created_at) VALUES (?,?,?)
         ON CONFLICT DO NOTHING RETURNING code`,
      )
      .bind(userId, code, now())
      .first<{ code: string }>();
    if (created) return created.code;
    const won = await db()
      .prepare('SELECT code FROM referral_codes WHERE user_id=?')
      .bind(userId)
      .first<{ code: string }>();
    if (won) return won.code;
  }
  throw new Error('Could not allocate referral code');
}

export async function referralCodeOwner(code: string) {
  return db()
    .prepare('SELECT user_id FROM referral_codes WHERE upper(code)=upper(?)')
    .bind(code.trim())
    .first<{ user_id: string }>();
}

export async function attachReferralForNewUser(
  request: Request,
  newUserId: string,
) {
  const code = decodeURIComponent(cookie(request, REFERRAL_COOKIE) || '')
    .trim()
    .toUpperCase();
  if (!code) return false;
  const owner = await referralCodeOwner(code);
  if (!owner || owner.user_id === newUserId) return false;
  const result = await db()
    .prepare(
      `INSERT INTO referrals(id,referrer_id,referred_user_id,code,status,registered_at,created_at)
       VALUES (?,?,?,?,'pending',?,?) ON CONFLICT(referred_user_id) DO NOTHING
       RETURNING id`,
    )
    .bind(uid(), owner.user_id, newUserId, code, now(), now())
    .first();
  return !!result;
}

export async function evaluateReferralQualification(referredUserId: string) {
  const referral = await db()
    .prepare(
      `SELECT id,referrer_id FROM referrals WHERE referred_user_id=? AND status='pending'`,
    )
    .bind(referredUserId)
    .first<{ id: string; referrer_id: string }>();
  if (!referral) return { qualified: false };
  const watch = await db()
    .prepare(
      'SELECT COALESCE(sum(watched_seconds),0) AS seconds FROM history WHERE user_id=?',
    )
    .bind(referredUserId)
    .first<{ seconds: number }>();
  const seconds = Number(watch?.seconds || 0);
  if (seconds < 3600) return { qualified: false, seconds };
  const won = await db()
    .prepare(
      `UPDATE referrals SET status='qualified',qualified_at=?
       WHERE id=? AND status='pending' RETURNING id,referrer_id`,
    )
    .bind(now(), referral.id)
    .first<{ id: string; referrer_id: string }>();
  if (won) {
    await grantPlusDays(
      referredUserId,
      3,
      `referral-friend:${won.id}`,
      'Награда приглашённому после 60 минут просмотра',
    );
    await grantReferralRewards(won.referrer_id);
  }
  return { qualified: !!won, seconds, referrerId: won?.referrer_id };
}

const MILESTONES = [
  { count: 1, cosmetics: ['recruiter'], plusDays: 0 },
  { count: 3, cosmetics: ['referral-scout'], plusDays: 0 },
  { count: 5, cosmetics: ['referral-crew'], plusDays: 7 },
  {
    count: 10,
    cosmetics: ['referral-master', 'referral-master-pin'],
    plusDays: 0,
  },
  {
    count: 25,
    cosmetics: ['animonster-legend', 'referral-legend'],
    plusDays: 30,
  },
] as const;

export async function grantReferralRewards(userId: string) {
  const row = await db()
    .prepare(
      `SELECT count(*) AS count FROM referrals WHERE referrer_id=? AND status='qualified'`,
    )
    .bind(userId)
    .first<{ count: number }>();
  const qualified = Number(row?.count || 0);
  for (const milestone of MILESTONES) {
    if (qualified < milestone.count) continue;
    await db()
      .prepare(
        `INSERT INTO referral_reward_claims(user_id,milestone,created_at)
         VALUES (?,?,?) ON CONFLICT DO NOTHING`,
      )
      .bind(userId, milestone.count, now())
      .run();
    for (const slug of milestone.cosmetics)
      await grantCosmetic(
        userId,
        slug,
        'referral',
        `referral:${milestone.count}:${slug}`,
        { milestone: milestone.count },
      );
    if (milestone.plusDays)
      await grantPlusDays(
        userId,
        milestone.plusDays,
        `referral-milestone:${milestone.count}`,
        `Реферальная награда за ${milestone.count} друзей`,
      );
  }
  return { qualified };
}

export async function referralDashboard(userId: string) {
  await grantReferralRewards(userId);
  const code = await ensureReferralCode(userId);
  const [counts, friends] = await Promise.all([
    db()
      .prepare(
        `SELECT count(*) AS registered,count(*) FILTER(WHERE status='qualified') AS qualified
         FROM referrals WHERE referrer_id=?`,
      )
      .bind(userId)
      .first<{ registered: number; qualified: number }>(),
    db()
      .prepare(
        `SELECT r.status,r.registered_at,r.qualified_at,u.nick
         FROM referrals r JOIN users u ON u.id=r.referred_user_id
         WHERE r.referrer_id=? ORDER BY r.created_at DESC LIMIT 100`,
      )
      .bind(userId)
      .all<{
        status: string;
        registered_at: number;
        qualified_at: number | null;
        nick: string;
      }>(),
  ]);
  return {
    code,
    url: `${base()}/ref/${code}`,
    registered: Number(counts?.registered || 0),
    qualified: Number(counts?.qualified || 0),
    friends: friends.results,
  };
}

import { base, cookie, db, now, uid } from './core';

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
       WHERE id=? AND status='pending' RETURNING referrer_id`,
    )
    .bind(now(), referral.id)
    .first<{ referrer_id: string }>();
  return { qualified: !!won, seconds, referrerId: won?.referrer_id };
}

export async function referralDashboard(userId: string) {
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

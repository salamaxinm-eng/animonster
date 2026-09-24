import { db, now, premium } from './core';

export const PLUS_PRICE = '89.00';
export const PLUS_DURATION_MS = 30 * 86400000;
export const FREE_EPISODE_DELAY_MS = 4 * 3600000;

export async function userLevel(userId: string) {
  const row = await db()
    .prepare(
      'SELECT COALESCE(sum(completed),0) AS episodes FROM history WHERE user_id=?',
    )
    .bind(userId)
    .first<{ episodes: number }>();
  const episodes = Number(row?.episodes || 0);
  return { episodes, level: 1 + Math.floor(episodes / 10) };
}

export async function plusEntitlements(userId: string) {
  const [premiumUntil, progress] = await Promise.all([
    premium(userId),
    userLevel(userId),
  ]);
  const active = premiumUntil > now();
  return {
    active,
    premiumUntil,
    level: progress.level,
    episodes: progress.episodes,
    canChangeAvatar: active || progress.level >= 5,
    customListLimit: active ? 20 : 3,
    telegramTitleLimit: active ? null : 3,
    canCustomizeLists: active,
    canCustomizeProfile: active,
    canReact: active,
    earlyAccess: active,
    canDownload: active,
  };
}

export const profileFrames = ['none', 'lime', 'violet', 'fire', 'ice'];
export const reactions = ['fire', 'wow', 'laugh', 'cry', 'shock', 'heart'];

export async function grantPlusDays(
  userId: string,
  days: number,
  sourceKey: string,
  reason: string,
) {
  const duration = Math.max(1, Math.floor(days)) * 86400000;
  return db()
    .prepare(
      `INSERT INTO grants(order_id,user_id,starts_at,expires,created_by,reason)
       SELECT ?,?,base,base+?,NULL,? FROM (
         SELECT GREATEST(?,COALESCE(MAX(expires) FILTER(WHERE revoked_at IS NULL),0)) AS base
         FROM grants WHERE user_id=?
       ) current
       ON CONFLICT(order_id) DO NOTHING RETURNING expires`,
    )
    .bind(`reward:${sourceKey}`, userId, duration, reason, now(), userId)
    .first<{ expires: number }>();
}

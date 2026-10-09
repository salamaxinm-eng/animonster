import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { ApiError, db, now, runtime, uid } from './core';
import { VPN_PLAN, VPN_PLUS_PLAN } from '../vpn-plan';

export const VPN_DEVICE_LIMIT = 5;
export function vpnPurchaseAvailable() {
  const config = runtime();
  return config.VPN_PAYMENTS_ENABLED === 'true' && config.PAYMENTS_ENABLED === 'true' &&
    !!config.PLATEGA_MERCHANT_ID && !!config.PLATEGA_SECRET_KEY;
}
export function vpnBundlePurchaseAvailable() {
  return vpnPurchaseAvailable() && runtime().VPN_BUNDLE_PAYMENTS_ENABLED === 'true';
}
const FIRST_SLOT = 3; // 10.88.0.2 is the private pilot profile.
const LAST_SLOT = 253;

type Subscription = { expires_at: number };
type Device = {
  id: string;
  user_id: string;
  name: string;
  slot: number;
  status: string;
  encrypted_profile: string | null;
  created_at: number;
  updated_at: number;
};
export type DeviceProfile = { awg: string; xray: string };

function key() {
  const encoded = runtime().VPN_CONFIG_KEY || '';
  const value = Buffer.from(encoded, 'base64');
  if (value.length !== 32 || value.toString('base64') !== encoded)
    throw new ApiError('Хранилище VPN ещё не настроено', 503, 'vpn_unavailable');
  return value;
}

export function encryptProfile(profile: DeviceProfile) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const payload = Buffer.concat([
    cipher.update(JSON.stringify(profile), 'utf8'),
    cipher.final(),
  ]);
  return [iv, cipher.getAuthTag(), payload]
    .map((part) => part.toString('base64url'))
    .join('.');
}

export function decryptProfile(value: string): DeviceProfile {
  const parts = value.split('.');
  if (parts.length !== 3) throw new ApiError('Профиль повреждён', 500);
  const [iv, tag, payload] = parts.map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8'));
}

export function requireAgent(request: Request) {
  const expected = runtime().VPN_AGENT_TOKEN;
  const supplied = request.headers.get('authorization')?.replace(/^Bearer /i, '') || '';
  if (!expected || expected.length < 32 || !supplied ||
      Buffer.byteLength(expected) !== Buffer.byteLength(supplied) ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(supplied)))
    throw new ApiError('Недоступно', 401, 'unauthorized');
}

export async function vpnOverview(userId: string) {
  const [subscription, devices] = await Promise.all([
    db().prepare('SELECT expires_at FROM vpn_subscriptions WHERE user_id=?')
      .bind(userId).first<Subscription>(),
    db().prepare(`SELECT id,name,status,created_at,updated_at FROM vpn_devices
      WHERE user_id=? AND status<>'revoked' ORDER BY created_at DESC`)
      .bind(userId).all<Omit<Device, 'user_id' | 'slot' | 'encrypted_profile'>>(),
  ]);
  return {
    expiresAt: Number(subscription?.expires_at || 0),
    active: Number(subscription?.expires_at || 0) > now(),
    maxDevices: VPN_DEVICE_LIMIT,
    purchase: {
      available: vpnPurchaseAvailable(), price: Number(VPN_PLAN.price), days: VPN_PLAN.days,
      bundleAvailable: vpnBundlePurchaseAvailable(), bundlePrice: Number(VPN_PLUS_PLAN.price),
    },
    devices: devices.results,
  };
}

export async function addVpnDevice(userId: string, rawName: unknown) {
  const name = String(rawName || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40 || /\p{Cc}/u.test(name))
    throw new ApiError('Укажите название устройства до 40 символов');
  key();
  if (!runtime().VPN_AGENT_TOKEN)
    throw new ApiError('Выдача VPN ещё не настроена', 503, 'vpn_unavailable');
  return db().transaction(async (tx) => {
    const stamp = now();
    await tx.prepare('UPDATE vpn_allocator SET revision=revision+1 WHERE id=1').run();
    const subscription = await tx.prepare(`UPDATE vpn_subscriptions SET updated_at=?
      WHERE user_id=? RETURNING expires_at`).bind(stamp, userId).first<Subscription>();
    if (!subscription || Number(subscription.expires_at) <= stamp)
      throw new ApiError('Активная VPN-подписка не найдена', 403, 'vpn_inactive');
    const devices = await tx.prepare(`SELECT slot FROM vpn_devices
      WHERE user_id=? AND status<>'revoked'`).bind(userId).all<{ slot: number }>();
    if (devices.results.length >= VPN_DEVICE_LIMIT)
      throw new ApiError('Достигнут лимит пяти устройств', 409, 'vpn_device_limit');
    const slots = await tx.prepare(`SELECT slot FROM vpn_devices WHERE status<>'revoked'`)
      .all<{ slot: number }>();
    const used = new Set(slots.results.map((row) => Number(row.slot)));
    let slot = FIRST_SLOT;
    while (slot <= LAST_SLOT && used.has(slot)) slot++;
    if (slot > LAST_SLOT)
      throw new ApiError('На сервере нет свободных адресов', 503, 'vpn_capacity');
    const id = uid();
    await tx.prepare(`INSERT INTO vpn_devices
      (id,user_id,name,slot,status,created_at,updated_at) VALUES (?,?,?,?,'pending',?,?)`)
      .bind(id, userId, name, slot, stamp, stamp).run();
    await tx.prepare(`INSERT INTO vpn_jobs
      (id,device_id,action,status,next_attempt_at,created_at,updated_at)
      VALUES (?,?,'create','queued',?,?,?)`)
      .bind(uid(), id, stamp, stamp, stamp).run();
    return { id, name, status: 'pending' };
  });
}

export async function revokeVpnDevice(userId: string, deviceId: string) {
  return db().transaction(async (tx) => {
    const stamp = now();
    const device = await tx.prepare(`UPDATE vpn_devices SET status='revoking',
      encrypted_profile=NULL,updated_at=? WHERE id=? AND user_id=?
      AND status IN ('pending','active','error','revoking') RETURNING id`)
      .bind(stamp, deviceId, userId).first<{ id: string }>();
    if (!device) throw new ApiError('Устройство не найдено', 404);
    await tx.prepare(`INSERT INTO vpn_jobs
      (id,device_id,action,status,next_attempt_at,created_at,updated_at)
      VALUES (?,?,'revoke','queued',?,?,?) ON CONFLICT DO NOTHING`)
      .bind(uid(), deviceId, stamp, stamp, stamp).run();
    return { ok: true };
  });
}

export async function getVpnProfile(userId: string, deviceId: string) {
  const device = await db().prepare(`SELECT d.encrypted_profile,d.status,s.expires_at
    FROM vpn_devices d JOIN vpn_subscriptions s ON s.user_id=d.user_id
    WHERE d.id=? AND d.user_id=?`).bind(deviceId, userId)
    .first<{ encrypted_profile: string | null; status: string; expires_at: number }>();
  if (!device || device.status !== 'active' || Number(device.expires_at) <= now() ||
      !device.encrypted_profile)
    throw new ApiError('Профиль недоступен', 404, 'vpn_profile_unavailable');
  return decryptProfile(device.encrypted_profile);
}

export async function queueExpiredVpnDevices() {
  const stamp = now();
  const expired = await db().prepare(`SELECT d.id,d.user_id FROM vpn_devices d
    JOIN vpn_subscriptions s ON s.user_id=d.user_id
    WHERE s.expires_at<=? AND d.status IN ('pending','active','error')`)
    .bind(stamp).all<{ id: string; user_id: string }>();
  for (const device of expired.results) await revokeVpnDevice(device.user_id, device.id);
}

export async function grantPilotVpnDays(userId: string, days: number) {
  if (!Number.isInteger(days) || days < 1 || days > 30)
    throw new ApiError('Можно выдать от 1 до 30 дней');
  return db().transaction(async (tx) => {
    const stamp = now();
    const user = await tx.prepare('SELECT id FROM users WHERE id=? AND deleted_at IS NULL FOR UPDATE')
      .bind(userId).first<{ id: string }>();
    if (!user) throw new ApiError('Пользователь не найден', 404);
    await tx.prepare(`INSERT INTO vpn_entitlements
      (id,user_id,source,awarded_at,duration_ms) VALUES (?,?,'pilot',?,?)`)
      .bind(uid(), userId, stamp, days * 86400000).run();
    const expires = await reconcileVpnEntitlements(tx, userId, stamp);
    return { expiresAt: expires };
  });
}

type VpnTransaction = ReturnType<typeof db>;

async function reconcileVpnEntitlements(tx: VpnTransaction, userId: string, stamp: number) {
  const grants = await tx.prepare(`SELECT awarded_at,duration_ms FROM vpn_entitlements
    WHERE user_id=? AND revoked_at IS NULL ORDER BY awarded_at,id`)
    .bind(userId).all<{ awarded_at: number; duration_ms: number }>();
  let expiry = 0;
  for (const grant of grants.results)
    expiry = Math.max(expiry, Number(grant.awarded_at)) + Number(grant.duration_ms);
  const storedExpiry = Math.max(expiry, stamp - 1);
  await tx.prepare(`INSERT INTO vpn_subscriptions(user_id,expires_at,granted_at,updated_at)
    VALUES (?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET
    expires_at=excluded.expires_at,granted_at=LEAST(vpn_subscriptions.granted_at,excluded.granted_at),
    updated_at=excluded.updated_at`)
    .bind(userId, storedExpiry, stamp - 2, stamp).run();
  if (storedExpiry <= stamp) {
    const devices = await tx.prepare(`UPDATE vpn_devices SET status='revoking',
      encrypted_profile=NULL,updated_at=? WHERE user_id=?
      AND status IN ('pending','active','error') RETURNING id`)
      .bind(stamp, userId).all<{ id: string }>();
    for (const device of devices.results)
      await tx.prepare(`INSERT INTO vpn_jobs
        (id,device_id,action,status,next_attempt_at,created_at,updated_at)
        VALUES (?,?,'revoke','queued',?,?,?) ON CONFLICT DO NOTHING`)
        .bind(uid(), device.id, stamp, stamp, stamp).run();
  } else {
    const devices = await tx.prepare(`SELECT id FROM vpn_devices
      WHERE user_id=? AND status='active'`).bind(userId).all<{ id: string }>();
    for (const device of devices.results)
      await tx.prepare(`INSERT INTO vpn_jobs
        (id,device_id,action,status,next_attempt_at,created_at,updated_at)
        VALUES (?,?,'renew','queued',?,?,?) ON CONFLICT DO NOTHING`)
        .bind(uid(), device.id, stamp, stamp, stamp).run();
  }
  return storedExpiry;
}

async function reconcilePlusGrants(tx: VpnTransaction, userId: string) {
  await tx.prepare(`INSERT INTO plus_grant_terms(order_id,user_id,awarded_at,duration_ms)
    SELECT g.order_id,g.user_id,
      CASE WHEN o.id IS NOT NULL AND o.duration_days>0
        THEN COALESCE(o.confirmed_at,g.starts_at) ELSE g.starts_at END,
      CASE WHEN o.id IS NOT NULL AND o.duration_days>0
        THEN o.duration_days * 86400000::bigint ELSE GREATEST(g.expires-g.starts_at,1) END
    FROM grants g LEFT JOIN orders o ON o.id=g.order_id
    WHERE g.user_id=? AND NOT g.lifetime ON CONFLICT(order_id) DO NOTHING`)
    .bind(userId).run();
  const active = await tx.prepare(`SELECT g.order_id,t.awarded_at,t.duration_ms
    FROM grants g JOIN plus_grant_terms t ON t.order_id=g.order_id
    WHERE g.user_id=? AND g.revoked_at IS NULL AND NOT g.lifetime
    ORDER BY t.awarded_at,g.order_id`)
    .bind(userId).all<{ order_id: string; awarded_at: number; duration_ms: number }>();
  let expiry = 0;
  for (const grant of active.results) {
    expiry = Math.max(expiry, Number(grant.awarded_at)) + Number(grant.duration_ms);
    await tx.prepare('UPDATE grants SET expires=? WHERE order_id=?')
      .bind(expiry, grant.order_id).run();
  }
}

async function confirmVpnOrder(orderId: string, userId: string,
  providerId: string, isTest: boolean, plan: 'vpn' | 'vpn_plus') {
  return db().transaction(async (tx) => {
    const stamp = now();
    await tx.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(userId).first();
    await tx.prepare(`UPDATE orders SET status='succeeded',provider_id=?,
      confirmed_at=COALESCE(confirmed_at,?),is_test=?
      WHERE id=? AND user_id=? AND plan=? AND status<>'chargebacked'`)
      .bind(providerId, stamp, isTest, orderId, userId, plan).run();
    const order = await tx.prepare(`SELECT confirmed_at,duration_days FROM orders
      WHERE id=? AND user_id=? AND plan=? AND status='succeeded'`)
      .bind(orderId, userId, plan).first<{ confirmed_at: number; duration_days: number }>();
    if (!order) return 'chargebacked';
    const inserted = await tx.prepare(`INSERT INTO vpn_entitlements
      (id,user_id,source,order_id,awarded_at,duration_ms)
      VALUES (?,?,'payment',?,?,?) ON CONFLICT(order_id) DO NOTHING RETURNING id`)
      .bind(uid(), userId, orderId, Number(order.confirmed_at), Number(order.duration_days) * 86400000)
      .first<{ id: string }>();
    if (plan === 'vpn_plus')
      await tx.prepare(`INSERT INTO grants(order_id,user_id,starts_at,expires,reason)
        SELECT ?,?,?,GREATEST(?,COALESCE((SELECT MAX(expires) FROM grants
          WHERE user_id=? AND revoked_at IS NULL),0))+?,'VPN + Plus'
        WHERE EXISTS(SELECT 1 FROM orders WHERE id=? AND status='succeeded')
        ON CONFLICT(order_id) DO NOTHING`)
        .bind(orderId, userId, Number(order.confirmed_at), stamp, userId,
          Number(order.duration_days) * 86400000, orderId).run();
    if (inserted) await reconcileVpnEntitlements(tx, userId, stamp);
    return 'succeeded';
  });
}

export async function confirmVpnPayment(orderId: string, userId: string,
  providerId: string, isTest: boolean) {
  return confirmVpnOrder(orderId, userId, providerId, isTest, 'vpn');
}

export async function confirmBundlePayment(orderId: string, userId: string,
  providerId: string, isTest: boolean) {
  return confirmVpnOrder(orderId, userId, providerId, isTest, 'vpn_plus');
}

async function revokeVpnOrder(orderId: string, userId: string,
  status: 'canceled' | 'chargebacked', plan: 'vpn' | 'vpn_plus') {
  return db().transaction(async (tx) => {
    const stamp = now();
    await tx.prepare('SELECT id FROM users WHERE id=? FOR UPDATE').bind(userId).first();
    await tx.prepare(`UPDATE orders SET status=? WHERE id=? AND user_id=?
      AND plan=? AND (status NOT IN ('succeeded','chargebacked') OR ?='chargebacked')`)
      .bind(status, orderId, userId, plan, status).run();
    if (status === 'chargebacked') {
      if (plan === 'vpn_plus')
        await tx.prepare('UPDATE grants SET revoked_at=? WHERE order_id=? AND revoked_at IS NULL')
          .bind(stamp, orderId).run();
      if (plan === 'vpn_plus') await reconcilePlusGrants(tx, userId);
      const revoked = await tx.prepare(`UPDATE vpn_entitlements SET revoked_at=?
        WHERE order_id=? AND revoked_at IS NULL RETURNING id`)
        .bind(stamp, orderId).first<{ id: string }>();
      if (revoked) await reconcileVpnEntitlements(tx, userId, stamp);
    }
  });
}

export async function revokeVpnPayment(orderId: string, userId: string,
  status: 'canceled' | 'chargebacked') {
  return revokeVpnOrder(orderId, userId, status, 'vpn');
}

export async function revokeBundlePayment(orderId: string, userId: string,
  status: 'canceled' | 'chargebacked') {
  return revokeVpnOrder(orderId, userId, status, 'vpn_plus');
}

export async function claimVpnJob() {
  await queueExpiredVpnDevices();
  for (;;) {
    const stamp = now();
    const leaseId = uid();
    const job = await db().prepare(`UPDATE vpn_jobs SET status='leased',attempt=attempt+1,
      lease_id=?,lease_until=?,updated_at=? WHERE id=(
        SELECT id FROM vpn_jobs WHERE
        (status='queued' OR (status='failed' AND attempt<8) OR
        (status='leased' AND lease_until<?)) AND next_attempt_at<=?
        ORDER BY created_at LIMIT 1
      ) AND (status='queued' OR (status='failed' AND attempt<8) OR
        (status='leased' AND lease_until<?)) AND next_attempt_at<=?
      RETURNING id,device_id,action,attempt,lease_id`)
      .bind(leaseId, stamp + 60000, stamp, stamp, stamp, stamp, stamp)
      .first<{ id: string; device_id: string; action: string; attempt: number; lease_id: string }>();
    if (!job) return null;
    const device = await db().prepare(`SELECT d.id,d.slot,d.status,s.expires_at
      FROM vpn_devices d JOIN vpn_subscriptions s ON s.user_id=d.user_id WHERE d.id=?`)
      .bind(job.device_id).first<{ id: string; slot: number; status: string; expires_at: number }>();
    if ((job.action === 'create' && (!device || device.status !== 'pending' ||
        Number(device.expires_at) <= stamp)) ||
        (job.action === 'renew' && (!device || device.status !== 'active'))) {
      await db().prepare(`UPDATE vpn_jobs SET status='done',lease_id=NULL,lease_until=NULL,
        updated_at=? WHERE id=? AND lease_id=?`).bind(stamp, job.id, leaseId).run();
      continue;
    }
    return { ...job, device, server: 'de2' };
  }
}

export async function completeVpnJob(data: Record<string, unknown>) {
  const id = String(data.id || '');
  const lease = String(data.leaseId || '');
  return db().transaction(async (tx) => {
    const job = await tx.prepare(`SELECT id,device_id,action,attempt FROM vpn_jobs
      WHERE id=? AND lease_id=? AND status='leased'`)
      .bind(id, lease).first<{ id: string; device_id: string; action: string; attempt: number }>();
    if (!job) throw new ApiError('Задание уже обработано', 409, 'stale_job');
    const stamp = now();
    if (data.error) {
      const delay = Math.min(300000, 5000 * 2 ** Math.min(job.attempt, 6));
      await tx.prepare(`UPDATE vpn_jobs SET status='failed',lease_id=NULL,
        lease_until=NULL,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?`)
        .bind(stamp + delay, String(data.error).slice(0, 300), stamp, id).run();
      if (job.action === 'create' && job.attempt >= 8)
        await tx.prepare(`UPDATE vpn_devices SET status='error',updated_at=?
          WHERE id=? AND status='pending'`).bind(stamp, job.device_id).run();
      return { ok: true };
    }
    if (job.action === 'create') {
      const profile = data.profile as DeviceProfile | undefined;
      if (!profile || typeof profile.awg !== 'string' || typeof profile.xray !== 'string' ||
          profile.awg.length > 12000 || profile.xray.length > 2000)
        throw new ApiError('Некорректный профиль агента');
      const valid = await tx.prepare(`SELECT d.id FROM vpn_devices d
        JOIN vpn_subscriptions s ON s.user_id=d.user_id
        WHERE d.id=? AND d.status='pending' AND s.expires_at>?`)
        .bind(job.device_id, stamp).first<{ id: string }>();
      if (valid)
        await tx.prepare(`UPDATE vpn_devices SET status='active',encrypted_profile=?,updated_at=?
          WHERE id=? AND status='pending'`)
          .bind(encryptProfile(profile), stamp, job.device_id).run();
      else {
        await tx.prepare(`UPDATE vpn_devices SET status='revoking',encrypted_profile=NULL,
          updated_at=? WHERE id=? AND status<>'revoked'`)
          .bind(stamp, job.device_id).run();
        await tx.prepare(`INSERT INTO vpn_jobs
          (id,device_id,action,status,next_attempt_at,created_at,updated_at)
          VALUES (?,?,'revoke','queued',?,?,?) ON CONFLICT DO NOTHING`)
          .bind(uid(), job.device_id, stamp, stamp, stamp).run();
      }
    } else if (job.action === 'revoke') {
      await tx.prepare(`UPDATE vpn_devices SET status='revoked',encrypted_profile=NULL,
        revoked_at=?,updated_at=? WHERE id=?`)
        .bind(stamp, stamp, job.device_id).run();
    }
    await tx.prepare(`UPDATE vpn_jobs SET status='done',lease_id=NULL,lease_until=NULL,
      updated_at=? WHERE id=?`).bind(stamp, id).run();
    return { ok: true };
  });
}

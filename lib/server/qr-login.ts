import { ApiError, db, hash, now, uid, emailVerificationEnabled } from './core';
import { QR_LOGIN_TTL, validQrId, validQrSecret, qrDevice } from '../qr-login';

type Challenge = {
  id: string;
  device: string;
  verification_code: string;
  status: string;
  user_id: string | null;
  source_session_hash: string | null;
  created_at: number;
  expires_at: number;
  user_agent: string;
  ip_hash: string;
};
const secret = () => (uid() + uid()).replaceAll('-', '');
const invalid = () =>
  new ApiError(
    'QR-код недействителен. Создайте новый на компьютере.',
    404,
    'qr_invalid',
  );
function live(row: Challenge | null) {
  if (!row) throw invalid();
  if (Number(row.expires_at) <= now())
    throw new ApiError(
      'Срок действия QR-кода истёк. Создайте новый.',
      410,
      'qr_expired',
    );
  return row;
}
export async function qrLimit(ip: string, creating: boolean) {
  const timestamp = now(),
    duration = creating ? 600000 : 60000;
  const row = await db()
    .prepare(`INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END,
    expires=CASE WHEN auth_limits.expires<=? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts`)
    .bind(
      'qr:' + (creating ? 'create:' : 'use:') + (await hash(ip)),
      timestamp + duration,
      timestamp,
      timestamp,
    )
    .first<{ attempts: number }>();
  if (Number(row?.attempts) > (creating ? 10 : 180))
    throw new ApiError(
      'Слишком много запросов. Попробуйте чуть позже.',
      429,
      'rate_limited',
    );
}
export async function createQrLogin(agent: string, ip: string) {
  const id = uid(),
    scanToken = secret(),
    browserToken = secret(),
    timestamp = now();
  const expiresAt = timestamp + QR_LOGIN_TTL,
    code = uid().replaceAll('-', '').slice(0, 6).toUpperCase();
  await db().batch([
    db()
      .prepare('DELETE FROM qr_login_requests WHERE expires_at<?')
      .bind(timestamp - 3600000),
    db()
      .prepare(`INSERT INTO qr_login_requests(id,scan_hash,browser_hash,device,user_agent,ip_hash,verification_code,created_at,expires_at)
      VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(
        id,
        await hash(scanToken),
        await hash(browserToken),
        qrDevice(agent),
        agent.slice(0, 250),
        await hash(ip),
        code,
        timestamp,
        expiresAt,
      ),
  ]);
  return {
    id,
    scanToken,
    browserToken,
    expiresAt,
    code,
    device: qrDevice(agent),
  };
}
export async function inspectQrLogin(id: unknown, scanToken: unknown) {
  if (!validQrId(id) || !validQrSecret(scanToken)) throw invalid();
  const row = live(
    await db()
      .prepare('SELECT * FROM qr_login_requests WHERE id=? AND scan_hash=?')
      .bind(id, await hash(scanToken))
      .first<Challenge>(),
  );
  return {
    id: row.id,
    device: row.device,
    code: row.verification_code,
    expiresAt: Number(row.expires_at),
    status: row.status,
  };
}
export async function decideQrLogin(
  id: unknown,
  scanToken: unknown,
  userId: string | null,
  sessionToken: string,
  approve: boolean,
) {
  if (!validQrId(id) || !validQrSecret(scanToken)) throw invalid();
  return db().transaction(async (tx) => {
    const row = live(
      await tx
        .prepare(
          'SELECT * FROM qr_login_requests WHERE id=? AND scan_hash=? FOR UPDATE',
        )
        .bind(id, await hash(scanToken))
        .first<Challenge>(),
    );
    if (row.status !== 'pending')
      throw new ApiError('Этот QR-код уже обработан.', 409, 'qr_used');
    if (approve) {
      const sessionHash = await hash(sessionToken);
      const session = await tx
        .prepare(`SELECT s.hash FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.user_id=? AND s.expires>?
        AND (u.suspended_until IS NULL OR u.suspended_until<?) AND u.deleted_at IS NULL
        AND (?=0 OR u.email IS NULL OR u.email_verified=1) FOR SHARE OF s,u`)
        .bind(
          sessionHash,
          userId,
          now(),
          now(),
          emailVerificationEnabled() ? 1 : 0,
        )
        .first();
      if (!session)
        throw new ApiError(
          'Войдите в аккаунт и подтвердите email, если это требуется.',
          401,
          'authentication_required',
        );
      await tx
        .prepare(
          "UPDATE qr_login_requests SET status='approved',user_id=?,source_session_hash=? WHERE id=?",
        )
        .bind(userId, sessionHash, id)
        .run();
    } else
      await tx
        .prepare("UPDATE qr_login_requests SET status='denied' WHERE id=?")
        .bind(id)
        .run();
    return { status: approve ? 'approved' : 'denied' };
  });
}
export async function pollQrLogin(
  id: unknown,
  browserToken: string,
  cancel = false,
) {
  if (!validQrId(id) || !validQrSecret(browserToken)) throw invalid();
  const tokenHash = await hash(browserToken);
  const row = live(
    await db()
      .prepare('SELECT * FROM qr_login_requests WHERE id=? AND browser_hash=?')
      .bind(id, tokenHash)
      .first<Challenge>(),
  );
  if (cancel) {
    await db()
      .prepare(
        "UPDATE qr_login_requests SET status='denied' WHERE id=? AND browser_hash=? AND status IN ('pending','approved')",
      )
      .bind(id, tokenHash)
      .run();
    return { status: 'denied' };
  }
  return { status: row.status };
}
export async function consumeQrLogin(id: unknown, browserToken: string) {
  if (!validQrId(id) || !validQrSecret(browserToken)) throw invalid();
  return db().transaction(async (tx) => {
    const row = live(
      await tx
        .prepare(
          'SELECT * FROM qr_login_requests WHERE id=? AND browser_hash=? FOR UPDATE',
        )
        .bind(id, await hash(browserToken))
        .first<Challenge>(),
    );
    if (row.status !== 'approved')
      throw new ApiError(
        'Вход ещё не подтверждён или код уже использован.',
        409,
        'qr_not_approved',
      );
    const user = await tx
      .prepare(`SELECT u.id FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.hash=? AND s.expires>?
      AND (u.suspended_until IS NULL OR u.suspended_until<?) AND u.deleted_at IS NULL
      AND (?=0 OR u.email IS NULL OR u.email_verified=1) FOR SHARE OF s,u`)
      .bind(
        row.user_id,
        row.source_session_hash,
        now(),
        now(),
        emailVerificationEnabled() ? 1 : 0,
      )
      .first();
    if (!user)
      throw new ApiError(
        'Подтверждение отозвано. Создайте новый QR-код.',
        401,
        'qr_revoked',
      );
    const token = secret(),
      timestamp = now();
    await tx
      .prepare(
        'INSERT INTO sessions(hash,user_id,user_agent,ip_hash,created_at,last_seen_at,expires) VALUES (?,?,?,?,?,?,?)',
      )
      .bind(
        await hash(token),
        row.user_id,
        row.user_agent,
        row.ip_hash,
        timestamp,
        timestamp,
        timestamp + 2592000000,
      )
      .run();
    await tx
      .prepare(
        "UPDATE qr_login_requests SET status='consumed',consumed_at=? WHERE id=?",
      )
      .bind(timestamp, id)
      .run();
    return token;
  });
}

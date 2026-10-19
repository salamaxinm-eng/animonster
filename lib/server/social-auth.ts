import {
  createRemoteJWKSet,
  customFetch,
  jwtVerify,
  type JWTVerifyGetKey,
} from 'jose';
import {
  ApiError,
  base,
  cookie,
  db,
  hash,
  inviteRequired,
  json,
  now,
  requireUser,
  runtime,
  sameOrigin,
  uid,
} from './core';
import { socialAccount, type SocialIdentity } from './social-accounts';
import { attachReferralForNewUser } from './referrals';
import { type SocialProvider } from '@/lib/social-auth';

const PROVIDERS = {
  google: {
    authorization: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    scope: 'openid email profile',
  },
  telegram: {
    authorization: 'https://oauth.telegram.org/auth',
    token: 'https://oauth.telegram.org/token',
    jwks: 'https://oauth.telegram.org/.well-known/jwks.json',
    issuer: ['https://oauth.telegram.org'],
    scope: 'openid profile',
  },
};
const keySets = new Map<SocialProvider, JWTVerifyGetKey>();
export function socialReady(provider: SocialProvider) {
  const config = credentials(provider);
  return !!config.client && !!config.secret;
}
function credentials(provider: SocialProvider) {
  const env = runtime();
  return provider === 'google'
    ? { client: env.GOOGLE_CLIENT_ID, secret: env.GOOGLE_CLIENT_SECRET }
    : {
        client: env.TELEGRAM_LOGIN_CLIENT_ID,
        secret: env.TELEGRAM_LOGIN_CLIENT_SECRET,
      };
}
function site() {
  return new URL(base()).origin;
}
function callback(provider: SocialProvider) {
  return site() + `/api/auth/${provider}/callback`;
}
function secure() {
  return site().startsWith('https:') ? '; Secure' : '';
}
function flowCookie(provider: SocialProvider, value: string, age: number) {
  return `am_oauth_${provider}=${value}; HttpOnly; SameSite=Lax; Path=/api/auth/${provider}; Max-Age=${age}${secure()}`;
}
function redirect(provider: SocialProvider, code: string, linking = false) {
  const url = new URL(
    linking ? '/profile?section=settings&settings=account' : '/profile',
    site(),
  );
  url.searchParams.set('auth', code);
  url.searchParams.set('provider', provider);
  const headers = new Headers({
    Location: url.href,
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
  });
  headers.append('Set-Cookie', flowCookie(provider, '', 0));
  return new Response(null, { status: 302, headers });
}
async function limit(request: Request) {
  const ip =
    request.headers.get('x-animonster-client-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'local';
  const timestamp = now();
  const row = await db()
    .prepare(`INSERT INTO auth_limits(key,attempts,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET
    attempts=CASE WHEN auth_limits.expires<=? THEN 1 ELSE auth_limits.attempts+1 END,
    expires=CASE WHEN auth_limits.expires<=? THEN excluded.expires ELSE auth_limits.expires END RETURNING attempts`)
    .bind(
      'social-auth:' + (await hash(ip)),
      timestamp + 10 * 60000,
      timestamp,
      timestamp,
    )
    .first<{ attempts: number }>();
  if (Number(row?.attempts) > 40)
    throw new ApiError('Слишком много попыток', 429, 'social_limited');
}

export async function startSocialAuth(
  request: Request,
  provider: SocialProvider,
) {
  const linking = request.method === 'POST';
  try {
    if (linking) sameOrigin(request);
    if (!socialReady(provider))
      return redirect(provider, 'social_unavailable', linking);
    await limit(request);
    let userId: string | null = null,
      sessionHash: string | null = null;
    if (linking) {
      const user = await requireUser(request),
        token = cookie(request, 'am_session');
      if (!token)
        throw new ApiError(
          'Нужна активная сессия',
          401,
          'social_session_expired',
        );
      userId = user.id;
      sessionHash = await hash(token);
    }
    const invite = linking
      ? ''
      : (new URL(request.url).searchParams.get('invite') || '')
          .trim()
          .toUpperCase();
    if (invite && !/^[A-Z0-9-]{8,64}$/.test(invite))
      throw new ApiError(
        'Некорректное приглашение',
        400,
        'social_invite_invalid',
      );
    const state = uid(),
      browser = uid() + uid(),
      nonce = uid() + uid(),
      verifier = (uid() + uid()).replaceAll('-', '');
    const challenge = Buffer.from(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
    ).toString('base64url');
    await db().batch([
      db().prepare('DELETE FROM auth_flows WHERE expires<?').bind(now()),
      db()
        .prepare(
          `INSERT INTO auth_flows(state,browser_hash,verifier,invite_hash,expires,provider,nonce,user_id,session_hash) VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          state,
          await hash(browser),
          verifier,
          invite ? await hash(invite) : null,
          now() + 10 * 60000,
          provider,
          nonce,
          userId,
          sessionHash,
        ),
    ]);
    const params = new URLSearchParams({
      client_id: credentials(provider).client!,
      redirect_uri: callback(provider),
      response_type: 'code',
      scope: PROVIDERS[provider].scope,
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    if (provider === 'google') params.set('prompt', 'select_account');
    return new Response(null, {
      status: 302,
      headers: {
        Location: PROVIDERS[provider].authorization + '?' + params,
        'Set-Cookie': flowCookie(provider, browser, 600),
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      },
    });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'bad_origin')
      return json({ error: error.message }, 403);
    return redirect(
      provider,
      error instanceof ApiError && error.code.startsWith('social_')
        ? error.code
        : 'social_failed',
      linking,
    );
  }
}

export async function verifySocialToken(
  provider: SocialProvider,
  token: string,
  nonce: string,
  client: string,
  resolver?: JWTVerifyGetKey,
): Promise<SocialIdentity> {
  if (token.length > 20000) throw new Error('Token too large');
  if (!resolver) {
    if (!keySets.has(provider))
      keySets.set(
        provider,
        createRemoteJWKSet(new URL(PROVIDERS[provider].jwks), {
          timeoutDuration: 8000,
          cacheMaxAge: 3600000,
          cooldownDuration: 30000,
          [customFetch]: (input, options) =>
            fetch(input, { ...options, redirect: 'error' }),
        }),
      );
    resolver = keySets.get(provider)!;
  }
  const { payload } = await jwtVerify(token, resolver, {
    issuer: PROVIDERS[provider].issuer,
    audience: client,
    algorithms: ['RS256'],
    requiredClaims: ['sub', 'iat', 'exp', 'nonce'],
    clockTolerance: 30,
    maxTokenAge: '10m',
  });
  if (
    payload.nonce !== nonce ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    (payload.azp !== undefined && payload.azp !== client) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== client)
  )
    throw new Error('Invalid token claims');
  let email: string | null = null,
    telegramId: string | null = null;
  if (provider === 'google') {
    if (
      payload.email_verified !== true ||
      typeof payload.email !== 'string' ||
      payload.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)
    )
      throw new Error('Email is not verified');
    email = payload.email.toLowerCase();
  } else {
    const id =
      typeof payload.id === 'number' && Number.isSafeInteger(payload.id)
        ? String(payload.id)
        : typeof payload.id === 'string'
          ? payload.id
          : '';
    if (!/^[1-9]\d{0,17}$/.test(id))
      throw new Error('Missing Telegram user ID');
    telegramId = id;
  }
  return {
    provider,
    subject: payload.sub,
    name:
      typeof payload.name === 'string' ? payload.name.slice(0, 100) : 'Monster',
    email,
    telegramId,
  };
}

export async function finishSocialAuth(
  request: Request,
  provider: SocialProvider,
) {
  let linking = false;
  try {
    if (!socialReady(provider)) return redirect(provider, 'social_unavailable');
    const params = new URL(request.url).searchParams,
      state = params.get('state'),
      browser = cookie(request, `am_oauth_${provider}`);
    if (!state || state.length > 100 || !browser || browser.length > 200)
      return redirect(provider, 'social_expired');
    const flow = await db()
      .prepare(`DELETE FROM auth_flows WHERE state=? AND browser_hash=? AND provider=? AND expires>?
      RETURNING verifier,nonce,invite_hash,user_id,session_hash`)
      .bind(state, await hash(browser), provider, now())
      .first<{
        verifier: string;
        nonce: string;
        invite_hash: string | null;
        user_id: string | null;
        session_hash: string | null;
      }>();
    if (!flow) return redirect(provider, 'social_expired');
    linking = !!flow.user_id;
    if (
      linking &&
      (await hash(cookie(request, 'am_session'))) !== flow.session_hash
    )
      throw new ApiError('Сессия изменилась', 401, 'social_session_expired');
    if (params.get('error'))
      return redirect(provider, 'social_cancelled', linking);
    const code = params.get('code');
    if (!code || code.length > 4096)
      return redirect(provider, 'social_failed', linking);
    const config = credentials(provider);
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callback(provider),
      client_id: config.client!,
      code_verifier: flow.verifier,
    });
    const headers: Record<string, string> = {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    };
    if (provider === 'google') body.set('client_secret', config.secret!);
    else
      headers.Authorization =
        'Basic ' +
        Buffer.from(`${config.client}:${config.secret}`).toString('base64');
    const response = await fetch(PROVIDERS[provider].token, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
      redirect: 'error',
      cache: 'no-store',
    });
    if (!response.ok) return redirect(provider, 'social_failed', linking);
    const raw = await response.text();
    if (raw.length > 50000) throw new Error('Token response too large');
    const tokens = JSON.parse(raw) as { id_token?: unknown };
    if (typeof tokens.id_token !== 'string')
      throw new Error('Missing ID token');
    const identity = await verifySocialToken(
      provider,
      tokens.id_token,
      flow.nonce,
      config.client!,
    );
    const account = await socialAccount(identity, {
      userId: flow.user_id,
      sessionHash: flow.session_hash,
      inviteHash: flow.invite_hash,
      inviteRequired: inviteRequired(),
    });
    if (account.created) {
      try {
        await attachReferralForNewUser(request, account.id);
      } catch {
        /* Referrals cannot block an otherwise valid login. */
      }
    }
    const result = redirect(
      provider,
      linking ? 'social_linked' : 'social_signed_in',
      linking,
    );
    if (!linking) {
      const session = uid() + uid();
      await db()
        .prepare(
          'INSERT INTO sessions(hash,user_id,user_agent,ip_hash,created_at,last_seen_at,expires) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(
          await hash(session),
          account.id,
          request.headers.get('user-agent')?.slice(0, 250) || '',
          await hash(
            request.headers.get('x-animonster-client-ip') ||
              request.headers.get('x-forwarded-for') ||
              'local',
          ),
          now(),
          now(),
          now() + 30 * 86400000,
        )
        .run();
      result.headers.append(
        'Set-Cookie',
        `am_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure()}`,
      );
    }
    return result;
  } catch (error) {
    return redirect(
      provider,
      error instanceof ApiError && error.code.startsWith('social_')
        ? error.code
        : 'social_failed',
      linking,
    );
  }
}

export type ProfileSocial = {
  vk_url?: string | null;
  telegram_url?: string | null;
  show_vk?: number;
  show_telegram?: number;
};

// Accept profile addresses only: no redirects, invite links, or executable URLs.
export function profileSocialUrl(
  value: unknown,
  provider: 'vk' | 'telegram',
): string | null {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 200)
    throw new Error('Некорректная ссылка');
  const input = value.trim();
  if (!input) return null;
  const parsed = new URL(
    /^https?:\/\//i.test(input) ? input : 'https://' + input,
  );
  const hosts =
    provider === 'vk' ? ['vk.com', 'www.vk.com', 'm.vk.com'] : ['t.me'];
  const name = parsed.pathname.replace(/^\//, '').replace(/\/$/, '');
  const valid =
    provider === 'vk'
      ? /^[a-zA-Z0-9_][a-zA-Z0-9_.]{1,63}$/.test(name)
      : /^[a-zA-Z][a-zA-Z0-9_]{3,31}$/.test(name);
  if (
    !hosts.includes(parsed.hostname) ||
    !['https:', 'http:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash ||
    !valid ||
    (provider === 'telegram' &&
      [
        'share',
        'joinchat',
        'addstickers',
        'proxy',
        'socks',
        'login',
        'confirmphone',
        'iv',
      ].includes(name.toLowerCase()))
  ) {
    throw new Error(
      provider === 'vk'
        ? 'Укажите ссылку на профиль vk.com/имя'
        : 'Укажите ссылку на профиль t.me/username',
    );
  }
  return `https://${provider === 'vk' ? 'vk.com' : 't.me'}/${name}`;
}

export function publicProfileSocial(
  user: ProfileSocial,
  own = false,
): ProfileSocial {
  const safe = (provider: 'vk' | 'telegram') => {
    try {
      return profileSocialUrl(
        user[provider === 'vk' ? 'vk_url' : 'telegram_url'],
        provider,
      );
    } catch {
      return null;
    }
  };
  return {
    vk_url: own || user.show_vk === 1 ? safe('vk') : null,
    telegram_url: own || user.show_telegram === 1 ? safe('telegram') : null,
    show_vk: user.show_vk === 1 ? 1 : 0,
    show_telegram: user.show_telegram === 1 ? 1 : 0,
  };
}

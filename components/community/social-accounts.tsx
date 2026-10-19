'use client';

import { useEffect, useState } from 'react';
import { useCommunity } from './context';
import { ResourceState, useResource } from './profile-hub/shared';
import { SocialProviderIcon } from './social-login';
import { socialProviderName } from '@/lib/social-auth';

export function SocialAccounts() {
  const community = useCommunity();
  const accounts = useResource<{ google: boolean; telegram: boolean }>(
    '/api/auth/accounts',
  );
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const reset = () => setBusy(false);
    addEventListener('pageshow', reset);
    return () => removeEventListener('pageshow', reset);
  }, []);
  return (
    <section className="hub-settings social-account-settings">
      <h2>Способы входа</h2>
      <p>
        Подключи Google или Telegram к этому профилю. История, коллекция и
        оформление останутся здесь.
      </p>
      <ResourceState {...accounts} />
      {accounts.data &&
        (['google', 'telegram'] as const).map((provider) => {
          const connected = accounts.data![provider];
          const ready =
            provider === 'google'
              ? community.googleReady
              : community.telegramReady;
          return (
            <form
              method="post"
              action={'/api/auth/' + provider}
              target="_top"
              className="social-account-row"
              key={provider}
              onSubmit={() => setBusy(true)}
            >
              <span>
                <SocialProviderIcon provider={provider} />
                {socialProviderName[provider]}
              </span>
              {connected ? (
                <strong>Подключён</strong>
              ) : (
                <button
                  className="hub-button"
                  type="submit"
                  disabled={!ready || busy || community.preview}
                >
                  {ready ? 'Подключить' : 'Пока недоступен'}
                </button>
              )}
            </form>
          );
        })}
      <small>
        Привязка Telegram для входа не включает уведомления автоматически. Ими
        можно управлять во вкладке «Уведомления».
      </small>
    </section>
  );
}

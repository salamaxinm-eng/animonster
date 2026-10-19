'use client';

import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { socialProviderName, type SocialProvider } from '@/lib/social-auth';

export function SocialProviderIcon({ provider }: { provider: SocialProvider }) {
  return provider === 'telegram' ? (
    <Send size={19} aria-hidden="true" />
  ) : (
    <svg width="19" height="19" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285f4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.23c1.89-1.74 2.98-4.3 2.98-7.36Z"
      />
      <path
        fill="#34a853"
        d="M12 22c2.7 0 4.96-.9 6.62-2.41l-3.23-2.51c-.9.6-2.05.96-3.39.96-2.6 0-4.8-1.76-5.59-4.12H3.07v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#fbbc05"
        d="M6.41 13.92A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.92V7.49H3.07A10 10 0 0 0 2 12c0 1.61.39 3.14 1.07 4.51l3.34-2.59Z"
      />
      <path
        fill="#ea4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.93 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
      />
    </svg>
  );
}

export function SocialLogin({
  googleReady,
  telegramReady,
  inviteRequired,
}: {
  googleReady: boolean;
  telegramReady: boolean;
  inviteRequired: boolean;
}) {
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const reset = () => setLeaving(false);
    addEventListener('pageshow', reset);
    return () => removeEventListener('pageshow', reset);
  }, []);
  return (
    <form
      className="social-login"
      method="get"
      target="_top"
      onSubmit={() => setLeaving(true)}
    >
      {inviteRequired && (
        <label>
          Приглашение для нового аккаунта
          <Input
            name="invite"
            placeholder="Если входишь впервые"
            minLength={8}
            maxLength={64}
            autoComplete="off"
          />
          <small>Для существующего аккаунта оставь поле пустым.</small>
        </label>
      )}
      <div className="social-login-buttons">
        {(['google', 'telegram'] as const).map((provider) => {
          const ready = provider === 'google' ? googleReady : telegramReady;
          return (
            <button
              type="submit"
              className={'social-login-button social-' + provider}
              key={provider}
              formAction={'/api/auth/' + provider}
              disabled={!ready || leaving}
              title={!ready ? 'Способ входа ещё настраивается' : undefined}
            >
              <SocialProviderIcon provider={provider} />
              Войти через {socialProviderName[provider]}
            </button>
          );
        })}
      </div>
      {(!googleReady || !telegramReady) && (
        <small className="social-auth-muted">
          {!googleReady && !telegramReady
            ? 'Google и Telegram ещё настраиваются.'
            : `${!googleReady ? 'Google' : 'Telegram'} ещё настраивается.`}
        </small>
      )}
      {leaving && <small role="status">Переходим к подтверждению входа…</small>}
    </form>
  );
}

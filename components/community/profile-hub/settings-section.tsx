'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { Profile } from '@/lib/community';
import { api, useCommunity } from '../context';
import { AccountData } from '../account-data';
import { SocialAccounts } from '../social-accounts';
import { ProfileSocialFields } from '../profile-social';
import { NotificationSettings } from './notification-settings';
import { Empty, ResourceState, useResource } from './shared';

export function SettingsSection({
  user,
  onChanged,
}: {
  user: Profile;
  onChanged: () => Promise<void>;
}) {
  const params = useSearchParams();
  const requested =
    params.get('settings') ||
    (params.get('tab') === 'notifications' ? 'notifications' : 'account');
  const tab = ['account', 'privacy', 'notifications', 'playback'].includes(
    requested,
  )
    ? requested
    : 'account';
  const community = useCommunity();
  const [draft, setDraft] = useState(user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const account = useResource<{ email: string | null; has_password: boolean }>(
    tab === 'account' ? '/api/profile-hub?kind=account' : null,
  );
  const blocks = useResource<Array<{ id: string; nick: string }>>(
    tab === 'privacy' ? '/api/community?action=blocks' : null,
  );
  useEffect(() => {
    setDraft(user);
  }, [user]);
  async function save() {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('profile', draft);
      await onChanged();
      setNotice('Настройки сохранены');
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function unblock(id: string) {
    setBusy(true);
    setError('');
    try {
      await api('block', { id, value: false });
      blocks.retry();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function resetPassword() {
    if (!account.data?.email) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/auth/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', email: account.data.email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setNotice(result.message);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    setBusy(true);
    setError('');
    try {
      await api('logout', {});
      await community.refresh();
      window.location.assign('/');
    } catch (cause) {
      setError((cause as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <nav className="hub-tabs" aria-label="Группы настроек">
        {[
          ['account', 'Аккаунт'],
          ['privacy', 'Приватность'],
          ['notifications', 'Уведомления'],
          ['playback', 'Просмотр'],
        ].map(([id, label]) => (
          <Link
            href={`/profile?section=settings&settings=${id}`}
            key={id}
            className={tab === id ? 'active' : ''}
            aria-current={tab === id ? 'page' : undefined}
          >
            {label}
          </Link>
        ))}
      </nav>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="hub-notice" role="status">
          {notice}
        </p>
      )}
      {tab === 'notifications' ? (
        <NotificationSettings />
      ) : (
        <form
          className="hub-settings"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          {tab === 'account' && (
            <>
              <h2>Данные профиля</h2>
              <label>
                Имя на сайте
                <input
                  value={draft.nick}
                  minLength={3}
                  maxLength={24}
                  required
                  autoComplete="username"
                  onChange={(event) =>
                    setDraft({ ...draft, nick: event.target.value })
                  }
                />
                <small>3–24 буквы, цифры, дефис или подчёркивание.</small>
              </label>
              <label>
                О себе
                <textarea
                  value={draft.bio}
                  maxLength={400}
                  onChange={(event) =>
                    setDraft({ ...draft, bio: event.target.value })
                  }
                />
                <small>{draft.bio.length} / 400</small>
              </label>
              <Link href="/profile?section=appearance">
                Изменить аватар и оформление →
              </Link>
            </>
          )}
          {tab === 'privacy' && (
            <>
              <h2>Приватность профиля</h2>
              <ProfileSocialFields draft={draft} onChange={setDraft} />
              <label className="hub-check">
                <input
                  type="checkbox"
                  checked={!!draft.wall_open}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      wall_open: event.target.checked ? 1 : 0,
                    })
                  }
                />
                Разрешить комментарии на стенке
              </label>
              <label className="hub-check">
                <input
                  type="checkbox"
                  checked={!!draft.collection_public}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      collection_public: event.target.checked ? 1 : 0,
                    })
                  }
                />
                Показывать список аниме и историю другим пользователям
              </label>
            </>
          )}
          {tab === 'playback' && (
            <>
              <h2>Настройки просмотра</h2>
              <label className="hub-check">
                <input
                  type="checkbox"
                  checked={!!draft.auto_skip_segments}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      auto_skip_segments: event.target.checked,
                    })
                  }
                />
                Автоматически пропускать опенинги и эндинги
              </label>
            </>
          )}
          <button className="hub-primary" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        </form>
      )}
      {tab === 'account' && (
        <section className="hub-settings">
          <h2>Вход и данные аккаунта</h2>
          <ResourceState {...account} />
          {account.data && (
            <>
              <p>
                {account.data.email
                  ? `Электронная почта: ${account.data.email}`
                  : 'Вход через внешний аккаунт.'}
              </p>
              {account.data.email && (
                <small>
                  {user.email_verified
                    ? 'Почта подтверждена'
                    : 'Почта не подтверждена'}
                </small>
              )}
              {account.data.has_password && account.data.email && (
                <button
                  className="hub-button"
                  disabled={busy}
                  onClick={() => void resetPassword()}
                >
                  Получить ссылку для смены пароля
                </button>
              )}
            </>
          )}
          <AccountData />
        </section>
      )}
      {tab === 'account' && <SocialAccounts />}
      {tab === 'privacy' && (
        <section className="hub-settings">
          <h2>Заблокированные пользователи</h2>
          <ResourceState {...blocks} />
          {blocks.data &&
            (blocks.data.length ? (
              blocks.data.map((item) => (
                <div className="hub-blocked-row" key={item.id}>
                  <Link href={`/members/${item.id}`}>{item.nick}</Link>
                  <button
                    className="hub-button"
                    disabled={busy}
                    onClick={() => void unblock(item.id)}
                  >
                    Разблокировать
                  </button>
                </div>
              ))
            ) : (
              <Empty>В чёрном списке пока никого нет.</Empty>
            ))}
        </section>
      )}
      <div className="hub-settings-links">
        {community.moderator && (
          <Link href="/profile/classic?tab=moderation">
            Модерация комментариев →
          </Link>
        )}
        <button
          className="hub-button"
          disabled={busy || community.preview}
          onClick={() => void logout()}
        >
          {community.preview ? 'Режим предпросмотра' : 'Выйти из аккаунта'}
        </button>
      </div>
    </>
  );
}

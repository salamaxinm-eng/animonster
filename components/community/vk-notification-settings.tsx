'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Empty, ResourceState, useResource } from './profile-hub/shared';

type Status = {
  ready: boolean;
  account: { vk_user_id: string | null; disabled_at: number | null } | null;
  subscriptions: { anime_id: number; title: string }[];
  limit: number | null;
};
export function VkNotificationSettings() {
  const status = useResource<Status>('/api/vk-notifications');
  const [link, setLink] = useState<{ url: string; command: string } | null>(
    null,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  async function action(value: string, anime?: number) {
    setBusy(true);
    setError('');
    setCopied(false);
    try {
      const response = await fetch('/api/vk-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: value, anime_id: anime }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось изменить уведомления ВК');
      setLink(result.url ? result : null);
      status.retry();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось подключить ВК',
      );
    } finally {
      setBusy(false);
    }
  }
  const connected =
    !!status.data?.account?.vk_user_id && !status.data.account.disabled_at;
  return (
    <section id="vk-notifications" className="hub-settings">
      <h2>Уведомления ВКонтакте</h2>
      <p>
        Сообщения о новых сериях от{' '}
        <a
          href="https://vk.ru/animonster1"
          target="_blank"
          rel="noopener noreferrer"
        >
          AniMonster.su
        </a>
        .
      </p>
      <ResourceState {...status} />
      {status.data &&
        (!status.data.ready ? (
          <Empty>Бот ВК пока недоступен.</Empty>
        ) : connected ? (
          <>
            <p>
              ВК подключён. Выбрано тайтлов: {status.data.subscriptions.length}
              {status.data.limit === null
                ? ' · без лимита'
                : ` из ${status.data.limit}`}
              .
            </p>
            <ul>
              {status.data.subscriptions.map((item) => (
                <li key={item.anime_id}>
                  <Link href={'/anime/' + item.anime_id}>{item.title}</Link>{' '}
                  <button
                    className="hub-button"
                    disabled={busy}
                    onClick={() => void action('unsubscribe', item.anime_id)}
                  >
                    Не уведомлять
                  </button>
                </li>
              ))}
            </ul>
            <button
              className="hub-button"
              disabled={busy}
              onClick={() => void action('disconnect')}
            >
              Отключить ВК
            </button>
          </>
        ) : (
          <>
            <p>
              {status.data.account?.disabled_at
                ? 'Сообщество не может отправлять вам сообщения. Разрешите сообщения ВК и подключите бота заново.'
                : 'Подключите бота, затем включайте уведомления на страницах аниме.'}
            </p>
            <button
              className="hub-primary"
              disabled={busy}
              onClick={() => void action('link')}
            >
              Подключить ВК
            </button>
          </>
        ))}
      {link && !connected && (
        <div>
          <p>
            Откройте сообщения сообщества и отправьте эту команду. Она действует
            15 минут:
          </p>
          <p style={{ overflowWrap: 'anywhere' }}>
            <code>{link.command}</code>
          </p>
          <button
            className="hub-button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link.command);
                setCopied(true);
              } catch {
                setError('Скопируйте команду вручную.');
              }
            }}
          >
            {copied ? 'Скопировано' : 'Скопировать команду'}
          </button>{' '}
          <a
            className="hub-button"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Открыть бота ВК
          </a>{' '}
          <button className="hub-button" onClick={() => status.retry()}>
            Проверить подключение
          </button>
        </div>
      )}
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

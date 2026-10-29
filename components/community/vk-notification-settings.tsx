'use client';
import { FeedbackMessage } from '@/components/feedback-message';
import { useEffect, useRef, useState } from 'react';
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
    [copied, setCopied] = useState(false),
    [waiting, setWaiting] = useState(false);
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
      if (value === 'disconnect') setWaiting(false);
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
  const retry = useRef(status.retry);
  retry.current = status.retry;
  useEffect(() => {
    if (!waiting || connected) return;
    const expires = Date.now() + 15 * 60000;
    const refresh = () => {
      if (Date.now() >= expires) {
        setWaiting(false);
        return;
      }
      if (!document.hidden) retry.current();
    };
    const timer = setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [waiting, connected]);
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
            <form
              action="/api/vk-notifications/connect"
              method="post"
              target="_blank"
              rel="noopener"
              onSubmit={() => {
                setWaiting(true);
                setLink(null);
                setError('');
              }}
            >
              <button type="submit" className="hub-primary" disabled={busy}>
                Подключить ВК
              </button>
            </form>
            <p>
              Откроется диалог ВК. Нажмите «Начать» или отправьте любое
              сообщение — код передастся автоматически.
            </p>
            {waiting && (
              <p role="status">
                Ожидаем подключение в ВК. Статус обновится автоматически.
              </p>
            )}
            <details>
              <summary>Не получается подключиться?</summary>
              <button
                className="hub-button"
                type="button"
                disabled={busy}
                onClick={() => void action('link')}
              >
                Показать резервную команду
              </button>
            </details>
          </>
        ))}
      {link && !connected && (
        <div>
          <p>
            Если быстрый переход не сработал, отправьте эту команду сообществу.
            Она действует 15 минут:
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
          <FeedbackMessage>{error}</FeedbackMessage>
        </p>
      )}
    </section>
  );
}

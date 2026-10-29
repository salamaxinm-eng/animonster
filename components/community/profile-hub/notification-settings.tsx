'use client';
import { UserNickname } from '@/components/user-nickname';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '../context';
import { Empty, ResourceState, useResource } from './shared';

type Notification = {
  id: string;
  nick: string; legend_origin_at?: number | null; nickname_style?: import('@/lib/nickname-styles').NicknameStyle | null;
  scope: string;
  seen: number;
  comment_id: string;
  achievement_name?:string|null;
  achievement_xp?:number;
};
type Telegram = {
  ready: boolean;
  account: { telegram_id: string | null; username: string | null } | null;
  subscriptions: Array<{ anime_id: number; title: string }>;
  limit: number | null;
};
export function NotificationSettings() {
  const notifications = useResource<Notification[]>(
    '/api/community?action=notifications',
  );
  const telegram = useResource<Telegram>('/api/telegram');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function read() {
    setBusy(true);
    setError('');
    try {
      await api('seen', {});
      notifications.retry();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function telegramAction(action: string) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
      telegram.retry();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section id="telegram" className="hub-settings">
        <h2>Telegram-уведомления</h2>
        <ResourceState {...telegram} />
        {telegram.data && (
          <>
            {telegram.data.account?.telegram_id ? (
              <>
                <p>
                  Подключён{' '}
                  {telegram.data.account.username
                    ? `@${telegram.data.account.username}`
                    : 'Telegram'}
                  . Выбрано тайтлов: {telegram.data.subscriptions.length}
                  {telegram.data.limit === null
                    ? ' · без лимита'
                    : ` из ${telegram.data.limit}`}
                  .
                </p>
                <ul>
                  {telegram.data.subscriptions.map((item) => (
                    <li key={item.anime_id}>
                      <Link href={`/anime/${item.anime_id}`}>{item.title}</Link>
                    </li>
                  ))}
                </ul>
                <button
                  className="hub-button"
                  disabled={busy}
                  onClick={() => void telegramAction('disconnect')}
                >
                  Отключить Telegram
                </button>
              </>
            ) : telegram.data.ready ? (
              <>
                <p>
                  Подключите бота, затем выбирайте уведомления на страницах
                  аниме.
                </p>
                <button
                  className="hub-primary"
                  disabled={busy}
                  onClick={() => void telegramAction('link')}
                >
                  Подключить Telegram
                </button>
              </>
            ) : (
              <Empty>Telegram-бот сейчас недоступен.</Empty>
            )}
          </>
        )}
      </section>
      <section className="hub-settings">
        <div className="hub-section-title">
          <h2>Ответы и записи на стенке</h2>
          <button
            className="hub-button"
            disabled={busy || !notifications.data?.some((item) => !item.seen)}
            onClick={() => void read()}
          >
            Прочитать все
          </button>
        </div>
        <ResourceState {...notifications} />
        {notifications.data &&
          (notifications.data.length ? (
            <div className="hub-notifications">
              {notifications.data.map((item) => (
                <Link
                  key={item.id}
                  className={!item.seen ? 'unread' : ''}
                  href={
                    item.scope==='achievement:one-piece' ? '/achievements/one-piece' : item.scope.startsWith('wall:')
                      ? `/members/${item.scope.slice(5)}#comment-${item.comment_id}`
                      : `/anime/${item.scope.split(':')[1]}${item.scope.split(':')[2] === 'episode' ? `?episode=${item.scope.split(':')[3]}` : ''}#comment-${item.comment_id}`
                  }
                >
                  {item.achievement_name ? <><strong>Достижение: {item.achievement_name}</strong> +{item.achievement_xp || 0} XP</> : <><strong><UserNickname user={item}/></strong> оставил сообщение в обсуждении</>}
                  {!item.seen && <small>Новое</small>}
                </Link>
              ))}
            </div>
          ) : (
            <Empty>Здесь появятся ответы на ваши комментарии.</Empty>
          ))}
      </section>
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

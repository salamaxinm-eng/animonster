'use client';

import { useEffect, useState } from 'react';

export function TelegramSettings() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  async function load() {
    const response = await fetch('/api/telegram');
    const result = await response.json();
    if (response.ok) setData(result);
  }
  useEffect(() => {
    void load();
  }, []);
  async function action(name: string) {
    setError('');
    const response = await fetch('/api/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: name }),
    });
    const result = await response.json();
    if (!response.ok)
      return setError(result.error || 'Не удалось выполнить действие');
    if (result.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    await load();
  }
  if (!data) return <p className="muted">Проверяем Telegram…</p>;
  return (
    <section className="telegram-settings">
      <h3>Telegram-уведомления</h3>
      {data.account?.telegram_id ? (
        <>
          <p>
            Подключён{' '}
            {data.account.username ? `@${data.account.username}` : 'Telegram'}.{' '}
            Выбрано тайтлов: {data.subscriptions.length}
            {data.limit == null ? ' · без лимита с Plus' : ` из ${data.limit}`}.
          </p>
          {!!data.subscriptions.length && (
            <ul>
              {data.subscriptions.map((item: any) => (
                <li key={item.anime_id}>
                  <a href={`/anime/${item.anime_id}`}>{item.title}</a>
                </li>
              ))}
            </ul>
          )}
          <button
            className="outline-button"
            type="button"
            onClick={() => void action('disconnect')}
          >
            Отключить Telegram
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Подключи бота, затем выбирай уведомления на страницах аниме.
          </p>
          <button
            className="primary"
            type="button"
            onClick={() => void action('link')}
          >
            Подключить Telegram
          </button>
        </>
      )}
      {error && <p className="error-msg">{error}</p>}
    </section>
  );
}

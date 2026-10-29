'use client';
import { FeedbackMessage } from '@/components/feedback-message';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';

type Restriction = {
  anime_id: number;
  source_url: string;
  title: string;
  reason: string;
  updated_at: number;
};
const endpoint = '/api/admin/title-restrictions';

export function TitleRestrictionsAdmin() {
  const [items, setItems] = useState<Restriction[]>([]);
  const [links, setLinks] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    const response = await fetch(endpoint, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok)
      throw new Error(data.error || 'Не удалось загрузить блокировки.');
    setItems(data.items);
  }, []);
  useEffect(() => {
    load()
      .catch((failure: Error) => setError(failure.message))
      .finally(() => setLoading(false));
  }, [load]);

  async function mutate(payload: Record<string, unknown>) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || 'Не удалось сохранить блокировки.');
      if (payload.action === 'add') {
        setLinks('');
        setReason('');
      }
      setMessage(
        payload.action === 'add'
          ? `Сохранено тайтлов: ${data.count}. Блокировка действует для всех серий.`
          : 'Блокировка снята.',
      );
      await load();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void mutate({ action: 'add', links, reason });
  }

  return (
    <section className="social-panel">
      <h2>Блокировки тайтлов в России</h2>
      <p className="muted">
        Вставьте ссылки из уведомления, каждую с новой строки. Ссылка на
        отдельную серию закроет весь тайтл. Повторы объединятся автоматически.
      </p>
      <form className="admin-skip-form title-restrictions-form" onSubmit={submit}>
        <label>
          Ссылки на тайтлы
          <textarea
            required
            rows={5}
            maxLength={12000}
            value={links}
            onChange={(event) => setLinks(event.target.value)}
            placeholder={
              'https://animonster.su/anime/57334\nhttps://animonster.su/anime/60543'
            }
            disabled={busy}
          />
        </label>
        <label>
          Примечание для администратора
          <textarea
            rows={2}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Номер и дата уведомления или причина"
            disabled={busy}
          />
        </label>
        <Button type="submit" disabled={busy || !links.trim()}>
          {busy ? 'Сохраняем…' : 'Заблокировать в России'}
        </Button>
      </form>
      <p className="muted">
        Изменения действуют сразу. Вместо тайтла показывается заглушка с
        переходом в VPN через 7 секунд; плеер и ссылки на серии также
        закрываются.
      </p>
      {error && <p role="alert"><FeedbackMessage>{error}</FeedbackMessage></p>}
      {message && <p role="status"><FeedbackMessage>{message}</FeedbackMessage></p>}
      {loading ? (
        <p role="status">Загружаем список…</p>
      ) : (
        <>
          <h3>Ограниченные тайтлы · {items.length}</h3>
          {items.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Тайтл</th>
                    <th>Примечание</th>
                    <th>Обновлено</th>
                    <th>Действие</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.anime_id}>
                      <td>
                        <a
                          href={item.source_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.title}
                        </a>
                        <br />
                        <small>#{item.anime_id} · Россия · все серии</small>
                      </td>
                      <td>{item.reason || '—'}</td>
                      <td>
                        {new Date(Number(item.updated_at)).toLocaleString(
                          'ru-RU',
                        )}
                      </td>
                      <td>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Снять блокировку в России для «${item.title}» и всех его серий?`,
                              )
                            )
                              void mutate({
                                action: 'remove',
                                animeId: item.anime_id,
                              });
                          }}
                        >
                          Снять блокировку
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>Заблокированных тайтлов нет.</p>
          )}
        </>
      )}
    </section>
  );
}

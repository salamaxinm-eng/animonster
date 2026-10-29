'use client';
import { FeedbackMessage } from '@/components/feedback-message';

import { useRef, type FormEvent } from 'react';
import { Button } from './ui/button';

export function BattlepassMemberActions({ season, user, premium, busy, error, message, mutate }: {
  season: string;
  user: string;
  premium: boolean;
  busy: boolean;
  error: string;
  message: string;
  mutate: (value: Record<string, unknown>) => Promise<any>;
}) {
  const pending = useRef<{ key: string; id: string } | null>(null);
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const delta = Number(form.get('delta'));
    const reason = String(form.get('reason') || '').trim();
    const key = JSON.stringify({ season, user, delta, reason });
    if (pending.current?.key !== key) pending.current = { key, id: crypto.randomUUID() };
    const result = await mutate({ action: 'adjust', season, user, delta, reason, requestId: pending.current.id });
    if (result) pending.current = null;
  }
  return <div className="pass-member-actions">
    <form onSubmit={adjust}>
      <fieldset disabled={busy} style={{ display: 'contents' }}>
        <label>Изменение XP (+ или −)<input name="delta" type="number" required min={-100000} max={100000} step={1} /></label>
        <label>Обязательная причина<textarea name="reason" required minLength={5} maxLength={1000} /></label>
        <p>Операция сохраняется в журнале. Уже полученное оформление не удаляется.</p>
        <Button type="submit">{busy ? 'Сохраняем…' : 'Применить корректировку'}</Button>
      </fieldset>
    </form>
    <form style={{ marginTop: 28 }} onSubmit={(event) => {
      event.preventDefault();
      const reason = String(new FormData(event.currentTarget).get('reason') || '').trim();
      void mutate({ action: 'grant_premium', season, user, reason });
    }}>
      <h3>Платный пропуск</h3>
      <p>{premium ? 'Платный пропуск этого сезона уже активен.' : 'Открывает премиальную ветку выбранного сезона без оплаты. XP не меняется; доступные награды выдаются по текущему уровню.'}</p>
      {!premium && <label>Причина выдачи<textarea name="reason" required minLength={5} maxLength={1000} disabled={busy} /></label>}
      <Button type="submit" disabled={busy || premium}>{premium ? 'Пропуск уже выдан' : 'Выдать платный пропуск'}</Button>
    </form>
    {error && <p className="pass-message error" role="alert"><FeedbackMessage>{error}</FeedbackMessage></p>}
    {message && <p className="pass-message" role="status"><FeedbackMessage>{message}</FeedbackMessage></p>}
  </div>;
}

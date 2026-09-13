'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export function BuySubscription({
  className = 'outline-button',
}: {
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось создать платёж');
      window.location.assign(result.confirmation_url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось создать платёж',
      );
      setBusy(false);
    }
  }

  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        AniMonster Plus
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sign-dialog plus-dialog">
          <DialogTitle>AniMonster Plus · 89 ₽</DialogTitle>
          <DialogDescription>
            30 дней без автосписаний. Повторная покупка добавляет ещё 30 дней.
          </DialogDescription>
          <ul className="plus-benefits">
            <li>Новые серии сразу, без четырёхчасовой задержки</li>
            <li>Telegram-уведомления по всем выбранным тайтлам</li>
            <li>До 20 своих списков и оформление коллекций</li>
            <li>Фон, рамка и расширенная витрина профиля</li>
            <li>Фирменные реакции и бонусные подборки</li>
          </ul>
          <a className="text-link" href="/plus">
            Посмотреть бонусные подборки →
          </a>
          {error && <p className="error-msg">{error}</p>}
          <button
            className="primary plus-buy-button"
            type="button"
            disabled={busy || !accepted}
            onClick={buy}
          >
            {busy ? 'Переходим к оплате…' : 'Купить на 30 дней · 89 ₽'}
          </button>
          <p className="plus-legal-links">
            <label>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />{' '}
              Принимаю{' '}
            </label>
            <a href="/legal/offer">условия оферты</a>.{' '}
            <a href="/legal/requisites">Реквизиты продавца</a>
          </p>
          <p className="muted">
            Если магазин ещё не подключён, Plus можно получить у администратора.
            Деньги при этом не списываются.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

'use client';

import { useState } from 'react';
import {
  Sparkles,
  Bell,
  Library,
  Palette,
  Play,
  Heart,
  ExternalLink,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

export function BuySubscription({
  className = 'outline-button',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [paymentUnavailable, setPaymentUnavailable] = useState(false);

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
      if (!response.ok && response.status === 503) {
        setPaymentUnavailable(true);
        setBusy(false);
        return;
      }
      if (!response.ok)
        throw new Error(result.error || 'Не удалось создать платёж');
      window.location.assign(result.url);
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
        <Sparkles size={16} aria-hidden="true" />{' '}
        {compact ? 'Plus' : 'AniMonster Plus'}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sign-dialog plus-dialog">
          <div className="plus-intro">
            <span className="plus-eyebrow">
              <Sparkles size={16} /> БОЛЬШЕ ВОЗМОЖНОСТЕЙ
            </span>
            <DialogTitle>
              AniMonster <span>Plus</span>
            </DialogTitle>
            <DialogDescription>
              Твой профиль. Твои коллекции. Ещё больше аниме.
            </DialogDescription>
          </div>
          <div className="plus-price-card">
            <div>
              <strong>89 ₽</strong>
              <span> / 30 дней</span>
            </div>
            <p>Без автосписаний. Продлеваешь, когда захочешь.</p>
          </div>
          <span className="platega-review-label" role="note">
            Platega test
          </span>
          <ul className="plus-benefits">
            {[
              {
                icon: Play,
                title: 'Ранний доступ',
                text: 'Новые серии без четырёхчасового ожидания',
              },
              {
                icon: Bell,
                title: 'Уведомления в Telegram',
                text: 'Все любимые тайтлы без лимита подписок',
              },
              {
                icon: Library,
                title: 'Коллекции по-твоему',
                text: 'До 20 списков с обложками и описаниями',
              },
              {
                icon: Palette,
                title: 'Профиль с характером',
                text: 'Аватар, фон, рамки и витрина любимого',
              },
              {
                icon: Heart,
                title: 'Особые бонусы',
                text: 'Эксклюзивные реакции и авторские подборки',
              },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Icon size={20} aria-hidden="true" />
                <div>
                  <strong>{title}</strong>
                  <span>{text}</span>
                </div>
              </li>
            ))}
          </ul>
          <a className="text-link" href="/plus">
            Посмотреть бонусные подборки →
          </a>
          {error && <p className="error-msg">{error}</p>}
          {paymentUnavailable && (
            <p className="plus-payment-notice" role="status">
              Оплата пока не подключена, деньги не списываются. Пока магазин
              настраивается, Plus можно получить у администратора.
            </p>
          )}
          <div className="plus-legal-links">
            <label>
              <input
                type="checkbox"
                checked={accepted}
                onChange={(event) => setAccepted(event.target.checked)}
              />{' '}
              <span>
                Принимаю{' '}
                <a
                  className="plus-agreement-link"
                  href="/legal/offer"
                  target="_blank"
                  rel="noreferrer"
                >
                  условия оферты
                </a>
              </span>
            </label>
            <nav className="plus-legal-list" aria-label="Документы и поддержка">
              {[
                ['/legal/requisites', 'Реквизиты продавца'],
                ['/legal/privacy', 'Политика конфиденциальности'],
                ['/legal/terms', 'Пользовательское соглашение'],
                ['/legal/prices', 'Цены и тарифы'],
                ['/legal/support', 'Поддержка'],
              ].map(([href, label]) => (
                <a
                  className="plus-legal-link"
                  href={href}
                  key={href}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>{label}</span>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              ))}
            </nav>
          </div>
          <button
            className="primary plus-buy-button"
            type="button"
            disabled={busy || !accepted || paymentUnavailable}
            onClick={buy}
          >
            {busy
              ? 'Переходим к оплате…'
              : paymentUnavailable
                ? 'Оплата скоро появится'
                : 'Купить на 30 дней · 89 ₽'}
          </button>
          <p className="plus-renewal-note">
            Уже есть Plus? Добавим 30 дней к оставшемуся сроку.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

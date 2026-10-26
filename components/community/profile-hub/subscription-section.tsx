'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bell, Crown, Download, Library, Palette } from 'lucide-react';
import type { Profile } from '@/lib/community';
import { subscriptionPlans } from '@/lib/subscription-plans';
import { BuySubscription } from '../buy-subscription';
import {
  Empty,
  More,
  ResourceState,
  dateLabel,
  usePagedResource,
  type Payment,
} from './shared';

const planNames: Record<string, string> = {
  monthly: 'Plus · 30 дней',
  annual: 'Plus · 365 дней',
  support: 'Plus · поддержка проекта',
  donation: 'Поддержка проекта',
  nickname: 'Оформление ника · навсегда',
};
const statusNames: Record<string, string> = {
  succeeded: 'Оплачено',
  pending: 'Ожидает подтверждения',
  canceled: 'Отменён',
  failed: 'Ошибка',
  expired: 'Истёк',
};
export function SubscriptionSection({
  user,
  onChanged,
}: {
  user: Profile;
  onChanged: () => Promise<void>;
}) {
  const resource = usePagedResource<Payment>('/api/profile-hub?kind=payments');
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  async function check() {
    setChecking(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setMessage(
        result.status === 'succeeded'
          ? 'Оплата подтверждена.'
          : result.status === 'not_found'
            ? 'Нет платежа для проверки.'
            : result.status === 'canceled'
              ? 'Оплата отменена.'
              : 'Платёж ожидает подтверждения.',
      );
      await onChanged();
      resource.retry();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setChecking(false);
    }
  }
  return (
    <>
      <section className="hub-plus-panel">
        <Crown size={38} aria-hidden="true" />
        <div>
          <h2>
            AniMonster <span>Plus</span>
          </h2>
          <p>
            {user.premium_until
              ? user.plus_lifetime
                ? 'Пожизненная подписка'
                : `Активна до ${dateLabel(user.premium_until)}`
              : 'Подписка не активна'}
          </p>
        </div>
        <BuySubscription
          className="hub-primary"
          label={user.premium_until ? 'Продлить' : 'Подключить Plus'}
        />
      </section>
      <div className="hub-plan-grid">
        {Object.values(subscriptionPlans).map((plan) => (
          <article className="hub-plan" key={plan.id}>
            <h3>{plan.label}</h3>
            <strong>{plan.priceLabel}</strong>
            <BuySubscription
              initialPlan={plan.id}
              label="Выбрать"
              className="hub-button"
            />
          </article>
        ))}
      </div>
      <section className="hub-benefits">
        <h2>Возможности Plus</h2>
        {[
          [
            Palette,
            'Оформление профиля',
            'Свой аватар и фон, доступные предметы оформления',
          ],
          [Bell, 'Telegram-уведомления', 'Без лимита выбранных тайтлов'],
          [Library, '20 своих списков', 'Описания, обложки и закрепление'],
          [Download, 'Просмотр офлайн', 'Загрузка доступных серий'],
        ].map(([Icon, title, text]) => {
          const BenefitIcon = Icon as typeof Crown;
          return (
            <div key={title as string}>
              <BenefitIcon aria-hidden="true" />
              <span>
                <strong>{title as string}</strong>
                <small>{text as string}</small>
              </span>
            </div>
          );
        })}
      </section>
      <div className="hub-section-title">
        <h2>История платежей</h2>
        <button
          className="hub-button"
          disabled={checking}
          onClick={() => void check()}
        >
          {checking ? 'Проверяем…' : 'Проверить оплату'}
        </button>
      </div>
      {message && (
        <p className="hub-notice" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="hub-error" role="alert">
          {error}
        </p>
      )}
      <ResourceState {...resource} />
      {!resource.loading &&
        !resource.error &&
        (resource.items.length ? (
          <div className="hub-payment-list">
            {resource.items.map((item) => (
              <div key={item.id}>
                <span>
                  {dateLabel(item.created_at)} ·{' '}
                  {planNames[item.plan || ''] || 'Подписка Plus'}
                </span>
                <strong>
                  {item.amount
                    ? `${Number(item.amount).toLocaleString('ru-RU')} ₽`
                    : ''}
                </strong>
                <small>{statusNames[item.status] || item.status}</small>
              </div>
            ))}
          </div>
        ) : (
          <Empty>Платежей пока нет.</Empty>
        ))}
      <More {...resource} />
      <Link className="hub-support-link" href="/legal/support">
        Помощь по подписке <span aria-hidden="true">→</span>
      </Link>
    </>
  );
}

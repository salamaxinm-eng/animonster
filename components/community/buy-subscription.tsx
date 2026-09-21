'use client';

import { useEffect, useState } from 'react';
import {
  SUPPORT_MIN_AMOUNT,
  SUPPORT_PLAN,
  subscriptionPlans,
  supportAmount,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';
import {
  Sparkles,
  Bell,
  Library,
  Palette,
  Play,
  Heart,
  ExternalLink,
  Crown,
  Trophy,
  Rocket,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';

type PlanChoice = SubscriptionPlan | typeof SUPPORT_PLAN;
type SupporterLeader = {
  id: string;
  nick: string;
  amount: number;
  payments: number;
};

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
  const [planId, setPlanId] = useState<PlanChoice>('monthly');
  const [customAmount, setCustomAmount] = useState('300');
  const [leaders, setLeaders] = useState<SupporterLeader[]>([]);
  const [leadersLoading, setLeadersLoading] = useState(false);
  const plan = planId === SUPPORT_PLAN ? null : subscriptionPlans[planId];
  const chosenSupportAmount = supportAmount(customAmount);
  const priceLabel = plan
    ? plan.priceLabel
    : `${chosenSupportAmount ?? SUPPORT_MIN_AMOUNT} ₽`;

  useEffect(() => {
    if (!open) return;
    setLeadersLoading(true);
    void fetch('/api/plus-supporters')
      .then((response) => (response.ok ? response.json() : { leaders: [] }))
      .then((result) => setLeaders(result.leaders || []))
      .catch(() => setLeaders([]))
      .finally(() => setLeadersLoading(false));
  }, [open]);

  async function buy() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          plan: planId,
          ...(planId === SUPPORT_PLAN ? { amount: chosenSupportAmount } : {}),
        }),
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
              Больше возможностей для тебя — больше возможностей для AniMonster.
            </DialogDescription>
          </div>
          <div className="plus-dialog-layout">
            <section className="plus-offer-column" aria-label="Выбор тарифа">
              <div
                className="plus-plan-options"
                role="group"
                aria-label="Тариф Plus"
              >
                {Object.values(subscriptionPlans).map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    aria-pressed={planId === option.id}
                    disabled={busy}
                    onClick={() => setPlanId(option.id)}
                  >
                    <span>
                      {option.id === 'annual' ? 'На год' : 'На месяц'}{' '}
                      {option.discount > 0 && <b>−10%</b>}
                    </span>
                    <strong>{option.priceLabel}</strong>
                    <small>{option.label}</small>
                  </button>
                ))}
                <button
                  type="button"
                  className="plus-support-plan"
                  aria-pressed={planId === SUPPORT_PLAN}
                  disabled={busy}
                  onClick={() => setPlanId(SUPPORT_PLAN)}
                >
                  <span>
                    <Rocket size={15} /> Свой тариф
                  </span>
                  <strong>от {SUPPORT_MIN_AMOUNT} ₽</strong>
                  <small>30 дней + место в рейтинге</small>
                </button>
              </div>

              {planId === SUPPORT_PLAN && (
                <div className="support-amount-picker">
                  <label htmlFor="plus-support-amount">
                    Сколько хочешь вложить в AniMonster
                  </label>
                  <div className="support-amount-input">
                    <input
                      id="plus-support-amount"
                      type="number"
                      inputMode="numeric"
                      min={SUPPORT_MIN_AMOUNT}
                      max={100000}
                      step={10}
                      value={customAmount}
                      onChange={(event) => setCustomAmount(event.target.value)}
                      aria-invalid={chosenSupportAmount === null}
                    />
                    <span>₽</span>
                  </div>
                  <div className="support-amount-presets">
                    {[150, 300, 500, 1000].map((amount) => (
                      <button
                        type="button"
                        key={amount}
                        onClick={() => setCustomAmount(String(amount))}
                      >
                        {amount.toLocaleString('ru-RU')} ₽
                      </button>
                    ))}
                  </div>
                  <small>
                    Целая сумма от 90 ₽. Ник и общая сумма появятся в рейтинге.
                  </small>
                </div>
              )}

              <div className="plus-price-card">
                <div>
                  <strong>{priceLabel}</strong>
                  <span> / {plan?.label || '30 дней'}</span>
                </div>
                <p>
                  {planId === SUPPORT_PLAN
                    ? '30 дней Plus, а вся сумма поднимает тебя в рейтинге.'
                    : 'Без автосписаний. Продлеваешь, когда захочешь.'}
                </p>
              </div>
              {planId === 'annual' && (
                <div className="annual-tag-offer">
                  <span className="user-tag user-tag-eternal-nakama">
                    Вечный накама
                  </span>
                  <p>
                    Твой знак верности AniMonster. Уникальный тег останется
                    навсегда после подтверждённой годовой покупки.
                  </p>
                  <small>
                    <s>1 068 ₽</s> · Экономия 106,80 ₽ относительно 12 месяцев.
                  </small>
                </div>
              )}
            </section>

            <aside className="supporter-board" aria-label="Лидеры поддержки">
              <div className="supporter-board-heading">
                <span>
                  <Trophy size={17} /> ЗАЛ СЛАВЫ
                </span>
                <strong>Топ поддержки</strong>
                <p>Три человека, которые сильнее всех двигают проект вперёд.</p>
              </div>
              <ol className="supporter-leaders">
                {[0, 1, 2].map((index) => {
                  const leader = leaders[index];
                  return (
                    <li key={leader?.id || index} data-rank={index + 1}>
                      <span className="supporter-rank">
                        {index === 0 ? <Crown size={18} /> : index + 1}
                      </span>
                      <span className="supporter-name">
                        {leader?.nick ||
                          (leadersLoading ? 'Загружаем…' : 'Место свободно')}
                      </span>
                      <strong>
                        {leader
                          ? `${leader.amount.toLocaleString('ru-RU')} ₽`
                          : '—'}
                      </strong>
                    </li>
                  );
                })}
              </ol>
              <div className="champion-tag-card">
                <div className="champion-reward-set">
                  <span>
                    <img src="/frames/champion-gold.svg" alt="" /> Рамка
                  </span>
                  <span>
                    <img src="/pins/champion-crown.svg" alt="" /> Пин
                  </span>
                </div>
                <span className="user-tag user-tag-number-one">Номер 1</span>
                <p>
                  Весь золотой комплект получает лидер. Обгони его — рамка, пин
                  и тег станут твоими.
                </p>
              </div>
            </aside>
          </div>

          <div className="plus-feature-strip">
            {[
              { icon: Play, title: 'Серии раньше', text: 'без ожидания' },
              { icon: Bell, title: 'Telegram', text: 'без лимита' },
              { icon: Library, title: '20 коллекций', text: 'со своим стилем' },
              { icon: Palette, title: 'Редкий профиль', text: 'рамки и фон' },
              { icon: Heart, title: 'Особые бонусы', text: 'для своих' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title}>
                <Icon size={18} />
                <span>
                  <strong>{title}</strong>
                  <small>{text}</small>
                </span>
              </div>
            ))}
          </div>
          <span className="platega-review-label" role="note">
            Platega test
          </span>
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
            disabled={
              busy ||
              !accepted ||
              paymentUnavailable ||
              (planId === SUPPORT_PLAN && chosenSupportAmount === null)
            }
            onClick={buy}
          >
            {busy
              ? 'Переходим к оплате…'
              : paymentUnavailable
                ? 'Оплата скоро появится'
                : planId === SUPPORT_PLAN
                  ? `Поддержать · ${priceLabel}`
                  : `Купить · ${priceLabel}`}
          </button>
          <p className="plus-renewal-note">
            Уже есть Plus? Добавим {plan?.label || '30 дней'} к оставшемуся
            сроку.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}

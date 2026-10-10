'use client';

import { useEffect, useId, useRef, useState } from 'react';
import {
  SUPPORT_MIN_AMOUNT,
  SUPPORT_MAX_AMOUNT,
  SUPPORT_PLAN,
  subscriptionPlans,
  supportAmount,
  type SubscriptionPlan,
} from '@/lib/subscription-plans';
import { VPN_PLUS_PLAN } from '@/lib/vpn-plan';
import {
  Sparkles,
  Bell,
  Library,
  Palette,
  Play,
  Check,
  ChartNoAxesColumn,
  SlidersHorizontal,
  ChevronDown,
  Download,
  Heart,
  X,
} from 'lucide-react';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useFundraisingGoals } from './fundraising-choice';
import { useCommunity } from './context';
import type { FundraisingReward } from '@/lib/fundraising';
import './buy-subscription.css';

type PlanChoice = SubscriptionPlan | typeof SUPPORT_PLAN;
const rewardLabels = {
  pin: 'Пин',
  tag: 'Тег',
  frame: 'Рамка',
  background: 'Фон',
};

function SupportHall() {
  const [open, setOpen] = useState(false);
  const [leaders, setLeaders] = useState<
    { id: string; nick: string; amount: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/plus-supporters', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw Error('Не удалось загрузить рейтинг');
        return response.json();
      })
      .then((result) => setLeaders(result.leaders || []))
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="plus-purchase-text-link">
        Зал славы →
      </DialogTrigger>
      <DialogContent className="plus-hall-dialog">
        <DialogTitle>Зал славы</DialogTitle>
        <DialogDescription>
          Подтверждённые покупки Plus и донаты складываются в общий рейтинг
          поддержки.
        </DialogDescription>
        {loading ? (
          <p role="status">Загружаем рейтинг…</p>
        ) : error ? (
          <p role="alert">{error}</p>
        ) : (
          <ol className="plus-hall-list">
            {leaders.map((leader, index) => (
              <li key={leader.id}>
                <span>
                  {index + 1}.{' '}
                  <a href={`/members/${leader.id}`}>{leader.nick}</a>
                </span>
                <strong>{leader.amount.toLocaleString('ru-RU')} ₽</strong>
              </li>
            ))}
            {!leaders.length && <li>Пока нет участников</li>}
          </ol>
        )}
        <div className="plus-hall-prize">
          <img src="/frames/champion-gold.svg" alt="Золотая рамка лидера" />
          <img src="/pins/champion-crown.svg" alt="Пин лидера" />
          <span className="user-tag user-tag-number-one">Номер 1</span>
        </div>
        <p>Рамка, пин и тег принадлежат текущему лидеру рейтинга.</p>
      </DialogContent>
    </Dialog>
  );
}

export function BuySubscription({
  className = 'outline-button',
  compact = false,
  label,
  initialPlan = 'monthly',
}: {
  className?: string;
  compact?: boolean;
  label?: string;
  initialPlan?: PlanChoice;
}) {
  const { user, loaded, login } = useCommunity();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [planId, setPlanId] = useState<PlanChoice>(initialPlan);
  const [customAmount, setCustomAmount] = useState('300');
  const [goalSlug, setGoalSlug] = useState('player');
  const [previewReward, setPreviewReward] = useState<FundraisingReward | null>(
    null,
  );
  const inputId = useId();
  const {
    goals,
    loading: goalsLoading,
    error: goalsError,
  } = useFundraisingGoals(open);
  const selectedGoal = goals.find(
    (goal) => goal.slug === goalSlug && goal.isActive,
  );
  const plan = planId === SUPPORT_PLAN ? null : subscriptionPlans[planId];
  const chosenSupportAmount = supportAmount(customAmount);
  const priceLabel = plan
    ? plan.priceLabel
    : chosenSupportAmount === null
      ? '—'
      : `${chosenSupportAmount.toLocaleString('ru-RU')} ₽`;
  const invalidAmount = planId === SUPPORT_PLAN && chosenSupportAmount === null;
  const disabled =
    busy ||
    goalsLoading ||
    !!goalsError ||
    !selectedGoal ||
    !accepted ||
    invalidAmount ||
    !loaded;
  const activePlus =
    !!user && (user.plus_lifetime || Number(user.premium_until) > Date.now());

  async function buy() {
    if (disabled || submitting.current) return;
    if (!user) {
      setOpen(false);
      login();
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          plan: planId,
          goalSlug,
          ...(planId === SUPPORT_PLAN ? { amount: chosenSupportAmount } : {}),
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          result.error || 'Не удалось создать платёж. Попробуйте ещё раз.',
        );
      if (!result.url)
        throw new Error('Платёжная ссылка не получена. Попробуйте ещё раз.');
      window.location.assign(result.url);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Не удалось создать платёж',
      );
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger className={className} onClick={() => setError('')}>
          <Sparkles size={16} aria-hidden="true" />{' '}
          {label || (compact ? 'Plus' : 'AniMonster Plus')}
        </DialogTrigger>
        <DialogContent className="plus-purchase-dialog" showCloseButton={false}>
          <header className="plus-purchase-header">
            <DialogTitle>
              AniMonster <span>Plus</span>
            </DialogTitle>
            <DialogDescription>
              Больше возможностей для тебя — больше возможностей для AniMonster.
            </DialogDescription>
            <DialogClose
              className="plus-purchase-close"
              aria-label="Закрыть окно покупки Plus"
            >
              <X size={20} />
            </DialogClose>
          </header>
          <div className="plus-purchase-body">
            <section aria-label="Направление поддержки">
              <h3>Куда направить поддержку?</h3>
              {goalsLoading && <p role="status">Загружаем цели поддержки…</p>}
              {goalsError && (
                <p className="plus-purchase-error" role="alert">
                  {goalsError}
                </p>
              )}
              <div
                className="plus-purchase-grid"
                role="group"
                aria-label="Сбор"
              >
                {goals
                  .filter((goal) => goal.isActive)
                  .map((goal) => {
                    const Icon =
                      goal.slug === 'player' ? Play : ChartNoAxesColumn;
                    return (
                      <button
                        key={goal.id}
                        className="plus-purchase-choice plus-purchase-goal"
                        type="button"
                        aria-pressed={goalSlug === goal.slug}
                        disabled={busy || goalsLoading}
                        onClick={() => setGoalSlug(goal.slug)}
                      >
                        <Icon size={24} aria-hidden="true" />
                        <span>
                          <strong>
                            {goal.slug === 'player'
                              ? 'Свой плеер'
                              : goal.shortTitle}
                          </strong>
                          <small>
                            {goal.slug === 'player'
                              ? 'Собираем на собственный видеохостинг'
                              : goal.slug === 'development'
                                ? 'Новые функции и улучшения'
                                : goal.description}
                          </small>
                        </span>
                        <span className="plus-choice-check" aria-hidden="true">
                          {goalSlug === goal.slug && <Check size={12} />}
                        </span>
                      </button>
                    );
                  })}
              </div>
            </section>
            <section aria-label="Выбор тарифа">
              <h3>Выбери тариф</h3>
              <div
                className="plus-purchase-grid"
                role="group"
                aria-label="Тариф Plus"
              >
                {Object.values(subscriptionPlans).map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className="plus-purchase-choice plus-purchase-plan"
                    aria-pressed={planId === option.id}
                    disabled={busy}
                    onClick={() => setPlanId(option.id)}
                  >
                    <span>
                      {option.label}
                      {option.discount > 0 && (
                        <b className="plus-purchase-discount">
                          −{option.discount}%
                        </b>
                      )}
                    </span>
                    <strong>{option.priceLabel}</strong>
                    <small>
                      {option.originalPriceLabel ? (
                        <s>{option.originalPriceLabel}</s>
                      ) : (
                        'Выгоднее на целый год'
                      )}
                    </small>
                    <span className="plus-choice-check" aria-hidden="true">
                      {planId === option.id && <Check size={12} />}
                    </span>
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="plus-purchase-custom-toggle"
                aria-expanded={planId === SUPPORT_PLAN}
                aria-controls={`${inputId}-custom`}
                disabled={busy}
                onClick={() =>
                  setPlanId(planId === SUPPORT_PLAN ? 'monthly' : SUPPORT_PLAN)
                }
              >
                <SlidersHorizontal size={19} aria-hidden="true" />
                <span>
                  Своя сумма поддержки
                  <small>Выбери сумму — мы ценим любую поддержку</small>
                </span>
                <ChevronDown size={17} />
              </button>
              {planId === SUPPORT_PLAN && (
                <div id={`${inputId}-custom`} className="plus-purchase-custom">
                  <label htmlFor={inputId}>Сумма поддержки, ₽</label>
                  <input
                    id={inputId}
                    type="number"
                    inputMode="numeric"
                    min={SUPPORT_MIN_AMOUNT}
                    max={SUPPORT_MAX_AMOUNT}
                    step={1}
                    value={customAmount}
                    disabled={busy}
                    onChange={(event) => setCustomAmount(event.target.value)}
                    aria-invalid={invalidAmount}
                    aria-describedby={`${inputId}-hint`}
                  />
                  <p
                    id={`${inputId}-hint`}
                    className={invalidAmount ? 'plus-purchase-error' : ''}
                  >
                    Целое число от {SUPPORT_MIN_AMOUNT} до{' '}
                    {SUPPORT_MAX_AMOUNT.toLocaleString('ru-RU')} ₽. Даёт{' '}
                    {subscriptionPlans.monthly.label} Plus; ник и сумма
                    поддержки появятся в рейтинге.
                  </p>
                </div>
              )}
              {planId === 'annual' && (
                <p className="plus-purchase-note">
                  Годовой бонус: постоянный тег «Вечный накама» после
                  подтверждения оплаты.
                </p>
              )}
              {activePlus && (
                <p className="plus-purchase-note">
                  После оплаты срок Plus продлится на выбранное количество дней.
                </p>
              )}
            </section>
            <section aria-label="Преимущества Plus">
              <h3>Что входит в Plus?</h3>
              <div className="plus-purchase-benefits">
                {[
                  {
                    icon: Play,
                    title: 'Ранний доступ к сериям',
                    text: 'Смотри новинки раньше',
                  },
                  {
                    icon: Bell,
                    title: 'Telegram-уведомления',
                    text: 'Без лимита тайтлов',
                  },
                  {
                    icon: Library,
                    title: '20 коллекций',
                    text: 'По своим темам и стилям',
                  },
                  {
                    icon: Palette,
                    title: 'Оформление профиля',
                    text: 'Рамки, фоны, пины и тег',
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <div key={title}>
                    <Icon size={21} aria-hidden="true" />
                    <span>
                      <strong>{title}</strong>
                      <small>{text}</small>
                    </span>
                  </div>
                ))}
              </div>
              <details className="plus-purchase-details">
                <summary>Все преимущества</summary>
                <p>
                  <Download size={15} aria-hidden="true" /> Загрузка серий для
                  просмотра офлайн
                </p>
                <p>
                  <Heart size={15} aria-hidden="true" /> Реакции и бонусные
                  подборки
                </p>
                <a href="/plus">Открыть подборки →</a>
              </details>
            </section>
            <section aria-label="Награды за поддержку">
              <div className="plus-purchase-section-heading">
                <h3>Награды за поддержку</h3>
                {selectedGoal?.bundleOwned && <span>Набор уже получен ✓</span>}
              </div>
              <div className="plus-purchase-rewards">
                {selectedGoal?.rewards.map((reward) => (
                  <button
                    type="button"
                    key={reward.id}
                    onClick={() => setPreviewReward(reward)}
                    aria-label={`Увеличить: ${reward.name}`}
                  >
                    <span>
                      <img src={reward.image} alt={reward.name} />
                    </span>
                    <small>{rewardLabels[reward.kind]}</small>
                  </button>
                ))}
              </div>
              {selectedGoal && !selectedGoal.bundleOwned && (
                <p className="plus-purchase-note">
                  Набор выбранного сбора добавится в профиль после подтверждения
                  оплаты.
                </p>
              )}
            </section>
            <div className="plus-purchase-extras">
              <SupportHall />
              <details className="plus-purchase-details">
                <summary>VPN + Plus</summary>
                <a href="/vpn">
                  Комплект на {VPN_PLUS_PLAN.days} дней —{' '}
                  {Number(VPN_PLUS_PLAN.price)} ₽ →
                </a>
              </details>
              <details className="plus-purchase-details">
                <summary>Документы и поддержка</summary>
                <nav aria-label="Документы и поддержка">
                  {[
                    ['/legal/requisites', 'Реквизиты'],
                    ['/legal/privacy', 'Конфиденциальность'],
                    ['/legal/terms', 'Соглашение'],
                    ['/legal/prices', 'Тарифы'],
                    ['/legal/support', 'Поддержка'],
                  ].map(([href, text]) => (
                    <a key={href} href={href} target="_blank" rel="noreferrer">
                      {text}
                    </a>
                  ))}
                </nav>
              </details>
            </div>
          </div>
          <footer className="plus-purchase-footer">
            {error && (
              <p className="plus-purchase-error" role="alert">
                {error}
              </p>
            )}
            <div className="plus-purchase-total" aria-live="polite">
              <span>
                Итого · {plan?.label || subscriptionPlans.monthly.label}
              </span>
              <strong>{priceLabel}</strong>
            </div>
            <label className="plus-purchase-agreement">
              <input
                type="checkbox"
                checked={accepted}
                disabled={busy}
                onChange={(event) => setAccepted(event.target.checked)}
              />
              <span>
                Принимаю{' '}
                <a href="/legal/offer" target="_blank" rel="noreferrer">
                  условия оферты
                </a>
              </span>
            </label>
            <div className="plus-purchase-action">
              <button type="button" disabled={disabled} onClick={buy}>
                {busy
                  ? 'Переходим к оплате…'
                  : !loaded
                    ? 'Загружаем…'
                    : invalidAmount
                      ? 'Укажите сумму поддержки'
                      : !user
                        ? 'Войти для оплаты →'
                        : `Оплатить ${priceLabel} →`}
              </button>
              <small>Разовый платёж · Без автопродления</small>
            </div>
          </footer>
        </DialogContent>
        <Dialog
          open={!!previewReward}
          onOpenChange={(value) => {
            if (!value) setPreviewReward(null);
          }}
        >
          <DialogContent className="plus-reward-dialog">
            <DialogTitle>{previewReward?.name}</DialogTitle>
            <DialogDescription>
              {previewReward ? rewardLabels[previewReward.kind] : 'Награда'}{' '}
              выбранного направления поддержки
            </DialogDescription>
            {previewReward && (
              <img src={previewReward.image} alt={previewReward.name} />
            )}
          </DialogContent>
        </Dialog>
      </Dialog>
    </>
  );
}

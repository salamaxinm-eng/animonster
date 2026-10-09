'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { DONATION_PLAN, DONATION_MIN_AMOUNT, DONATION_MAX_AMOUNT, donationAmount } from '@/lib/fundraising';
import { useCommunity } from './context';
import { FundraisingChoice, useFundraisingGoals } from './fundraising-choice';

export function SupportDonation({
  initialGoalSlug,
  disabled = false,
}: {
  initialGoalSlug: string;
  disabled?: boolean;
}) {
  const community = useCommunity();
  const [open, setOpen] = useState(false);
  const [goalSlug, setGoalSlug] = useState(initialGoalSlug);
  const [amount, setAmount] = useState(String(DONATION_MIN_AMOUNT));
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { goals, loading, error: goalsError } = useFundraisingGoals(open);
  const selected = goals.find(
    (goal) => goal.slug === goalSlug && goal.isActive,
  );
  const chosenAmount = donationAmount(amount);

  async function buy() {
    if (!community.user) {
      setOpen(false);
      community.login();
      return;
    }
    if (!selected || chosenAmount === null || !accepted || busy) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          plan: DONATION_PLAN,
          amount: chosenAmount,
          goalSlug,
        }),
      });
      const result = await response.json();
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
      <button
        type="button"
        className="stats-support-button"
        disabled={disabled}
        onClick={() => {
          setGoalSlug(initialGoalSlug);
          setError('');
          setOpen(true);
        }}
      >
        <Heart size={16} /> Поддержать проект
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sign-dialog donation-dialog">
          <DialogTitle>Поддержать AniMonster</DialogTitle>
          <DialogDescription>
            Выберите цель и сумму поддержки.
          </DialogDescription>
          {loading && <p role="status">Загружаем цели…</p>}
          {goalsError && (
            <p className="error-msg" role="alert">
              {goalsError}
            </p>
          )}
          <FundraisingChoice
            goals={goals}
            goalSlug={goalSlug}
            onChange={setGoalSlug}
            disabled={busy || loading}
          />
          <div className="support-amount-picker">
            <label htmlFor="donation-amount">Сумма поддержки</label>
            <div className="support-amount-input">
              <input
                id="donation-amount"
                type="number"
                inputMode="numeric"
                min={DONATION_MIN_AMOUNT}
                max={DONATION_MAX_AMOUNT}
                step={1}
                value={amount}
                disabled={busy}
                aria-invalid={chosenAmount === null}
                onChange={(event) => setAmount(event.target.value)}
              />
              <span>₽</span>
            </div>
            <div className="support-amount-presets">
              {[DONATION_MIN_AMOUNT, 300, 500, 1000].map((value) => (
                <button
                  type="button"
                  key={value}
                  disabled={busy}
                  onClick={() => setAmount(String(value))}
                >
                  {value.toLocaleString('ru-RU')} ₽
                </button>
              ))}
            </div>
            <small>
              От {DONATION_MIN_AMOUNT} ₽. Набор остаётся навсегда. Подписку Plus можно приобрести
              отдельно.
            </small>
          </div>
          <label className="plus-agreement-label">
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
          {error && (
            <p className="error-msg" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="primary plus-buy-button"
            onClick={() => void buy()}
            disabled={
              busy ||
              loading ||
              !!goalsError ||
              !selected ||
              (community.user ? !accepted || chosenAmount === null : false)
            }
          >
            {busy
              ? 'Переходим к оплате…'
              : community.user
                ? `Поддержать · ${chosenAmount ?? '—'} ₽`
                : 'Войти и поддержать'}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}

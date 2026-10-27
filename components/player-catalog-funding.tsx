'use client';
import { useEffect, useState } from 'react';
import { SupportDonation } from '@/components/community/support-donation';
import type { PlayerCatalogFunding } from '@/lib/player-catalog-funding';

const rubles = (cents: number) =>
  (cents / 100).toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
export function PlayerCatalogFundingBar() {
  const [funding, setFunding] = useState<PlayerCatalogFunding | null>(null),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function update() {
      if (busy || document.hidden) return;
      busy = true;
      try {
        const response = await fetch('/api/player-demo/funding', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw Error();
        const data = (await response.json()) as PlayerCatalogFunding;
        if (!controller.signal.aborted) {
          setFunding(data);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        busy = false;
      }
    }
    void update();
    const timer = setInterval(() => void update(), 30000);
    const visible = () => {
      if (!document.hidden) void update();
    };
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('focus', visible);
    return () => {
      controller.abort();
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('focus', visible);
    };
  }, [retry]);
  const unavailable = !funding || !funding.acceptingDonations;
  const amount = funding
    ? `${rubles(funding.currentCents)} из ${rubles(funding.targetCents)}`
    : error
      ? 'Не удалось загрузить'
      : 'Загружаем…';
  const heading = funding?.completedRounds
    ? `Собрано на ${funding.fundedTitles.toLocaleString('ru-RU')} тайтлов. Продолжим?`
    : 'Ещё 200 тайтлов';
  return (
    <div className="player-catalog-funding player-catalog-funding-compact">
      <SupportDonation
        initialGoalSlug="player"
        className="player-funding-button"
        disabled={unavailable}
        ariaLabel={`${heading}. ${amount}. ${funding && !funding.acceptingDonations ? 'Донаты сейчас недоступны' : 'Нажмите, чтобы выбрать сумму и поддержать плеер'}`}
        triggerContent={
          <>
            <span className="player-funding-heading">
              <span>{heading}</span>
              <strong>{amount}</strong>
            </span>
            <span
              className="player-funding-track"
              role="progressbar"
              aria-label="Сбор на следующие 200 тайтлов"
              aria-valuemin={0}
              aria-valuemax={1500}
              aria-valuenow={funding ? funding.currentCents / 100 : undefined}
              aria-valuetext={amount}
            >
              <span style={{ width: `${funding?.percent ?? 0}%` }} />
            </span>
            {funding && !funding.acceptingDonations && (
              <span className="player-funding-availability">
                Донаты сейчас недоступны
              </span>
            )}
          </>
        }
      />
      {error && (
        <button
          type="button"
          className="player-funding-retry"
          onClick={() => setRetry((n) => n + 1)}
        >
          Обновить прогресс
        </button>
      )}
    </div>
  );
}

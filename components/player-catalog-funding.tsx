'use client';
import { useEffect, useState } from 'react';
import { Library } from 'lucide-react';
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
  return (
    <div
      className="player-catalog-funding"
      aria-label="Сбор на пополнение каталога плеера"
    >
      <div className="player-funding-heading">
        <span>До следующих 200 тайтлов</span>
        <strong>
          {funding
            ? `${rubles(funding.currentCents)} из ${rubles(funding.targetCents)}`
            : error
              ? 'Сумма недоступна'
              : 'Загружаем прогресс…'}
        </strong>
      </div>
      {funding && (
        <div
          className="player-funding-track"
          role="progressbar"
          aria-label="Подтверждённые донаты на следующий круг"
          aria-valuemin={0}
          aria-valuemax={funding.targetCents / 100}
          aria-valuenow={funding.currentCents / 100}
          aria-valuetext={`${rubles(funding.currentCents)} из ${rubles(funding.targetCents)}`}
        >
          <span style={{ width: `${funding.percent}%` }} />
        </div>
      )}
      <div className="player-funding-bottom">
        <div className="player-funding-copy">
          <Library size={27} aria-hidden="true" />
          <div>
            <b>Каждые 1 500 ₽ — ещё 200 тайтлов</b>
            <p>
              {funding?.completedRounds
                ? `Собрано на ${funding.fundedTitles.toLocaleString('ru-RU')} тайтлов. Продолжим?`
                : 'Помогите пополнить каталог нашего плеера.'}
            </p>
          </div>
        </div>
        <SupportDonation
          initialGoalSlug="player"
          disabled={!funding || !funding.acceptingDonations}
        />
      </div>
      <p className="player-funding-note">
        Новый сбор: учитываются подтверждённые прямые донаты на «Свой плеер».
        Остаток переходит в следующий круг.
      </p>
      <div className="player-funding-reward">
        <img
          src="/rewards/player-catalog/patron-v1.png"
          alt="Тег Меценат"
          width={2159}
          height={728}
          loading="lazy"
        />
        <p>
          Тег навсегда за подтверждённый донат в этот сбор от 150 ₽. Можно
          выбрать в оформлении профиля.
        </p>
      </div>
      {funding && !funding.acceptingDonations && (
        <p role="status" className="player-funding-status">
          Донаты сейчас недоступны.
        </p>
      )}
      {error && (
        <p role="status" className="player-funding-status">
          {funding
            ? 'Не удалось обновить сумму. Показаны последние полученные данные.'
            : 'Не удалось загрузить сумму сбора.'}{' '}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            Обновить
          </button>
        </p>
      )}
    </div>
  );
}

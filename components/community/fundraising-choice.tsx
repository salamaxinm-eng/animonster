'use client';

import { useEffect, useState } from 'react';
import type { FundraisingGoal } from '@/lib/fundraising';

export function useFundraisingGoals(enabled: boolean) {
  const [goals, setGoals] = useState<FundraisingGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void fetch('/api/fundraising', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Не удалось загрузить цели поддержки');
        const result = await response.json();
        setGoals(result.goals || []);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            'Не удалось загрузить цели поддержки. Откройте окно ещё раз.',
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [enabled]);
  return { goals, loading, error };
}

export function GoalRewardPreview({
  goal,
  compact = false,
}: {
  goal: FundraisingGoal;
  compact?: boolean;
}) {
  if (!goal.rewards.length) return null;
  return (
    <div
      className={`fundraising-reward${compact ? ' fundraising-reward-compact' : ''}`}
    >
      {!compact && <strong>Подарок за поддержку</strong>}
      <div className="fundraising-reward-items">
        {goal.rewards.map((item) => (
          <figure key={item.id} className={`fundraising-reward-${item.kind}`}>
            <img src={item.image} alt={item.name} loading="lazy" />
            <figcaption>
              {
                { pin: 'Пин', tag: 'Тег', frame: 'Рамка', background: 'Фон' }[
                  item.kind
                ]
              }
            </figcaption>
          </figure>
        ))}
      </div>
      {!compact && (
        <p>
          {goal.bundleOwned
            ? 'Набор за поддержку ' +
              (goal.slug === 'development'
                ? 'развития'
                : goal.shortTitle.toLocaleLowerCase('ru')) +
              ' уже получен ✓'
            : 'После успешной оплаты набор будет добавлен в ваш профиль. Прямая поддержка — от 150 ₽.'}
        </p>
      )}
    </div>
  );
}

export function FundraisingChoice({
  goals,
  goalSlug,
  onChange,
  disabled = false,
}: {
  goals: FundraisingGoal[];
  goalSlug: string;
  onChange: (slug: string) => void;
  disabled?: boolean;
}) {
  const selected = goals.find(
    (goal) => goal.slug === goalSlug && goal.isActive,
  );
  return (
    <section className="fundraising-choice">
      <h3>Куда направить поддержку?</h3>
      <div
        className="fundraising-goal-switch"
        role="group"
        aria-label="Цель поддержки"
      >
        {goals
          .filter((goal) => goal.isActive)
          .map((goal) => (
            <button
              type="button"
              key={goal.id}
              aria-pressed={goal.slug === goalSlug}
              disabled={disabled}
              onClick={() => onChange(goal.slug)}
            >
              {goal.slug === 'development' ? goal.title : goal.shortTitle}
            </button>
          ))}
      </div>
      {selected ? (
        <>
          <p className="fundraising-selected">
            Вы поддерживаете: <strong>{selected.title}</strong>
          </p>
          <GoalRewardPreview goal={selected} />
        </>
      ) : (
        <p role="status">Выберите активную цель поддержки.</p>
      )}
    </section>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  nicknameColors,
  nicknameEffects,
  NICKNAME_PRICE,
  type NicknameStyle,
} from '@/lib/nickname-styles';
import type { Profile } from '@/lib/community';
import { UserNickname } from '@/components/user-nickname';
export function NicknameEditor({
  user,
  value,
  onChange,
  onChanged,
  busy,
}: {
  user: Profile;
  value: NicknameStyle | null;
  onChange: (style: NicknameStyle | null) => void;
  onChanged: () => Promise<void>;
  busy: boolean;
}) {
  const params = useSearchParams(),
    checked = useRef(false);
  const [paying, setPaying] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const unlocked = !!user.nickname_unlocked;
  const selected = value || {
    color: user.legend_origin_at ? 'legend' : 'default',
    effect: user.legend_origin_at ? 'shimmer' : 'solid',
    motion: !!user.legend_origin_at,
  };
  async function payment(action: 'buy' | 'check') {
    if (paying) return;
    setPaying(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/nickname/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось проверить оплату');
      if (result.url) {
        window.location.assign(result.url);
        return;
      }
      await onChanged();
      setNotice(
        result.status === 'succeeded'
          ? 'Оплата подтверждена. Набор открыт навсегда — выберите стиль и сохраните.'
          : result.status === 'chargebacked'
            ? 'Платёж возвращён.'
            : result.status === 'canceled'
              ? 'Оплата отменена.'
              : result.status === 'not_found'
                ? 'Заказов пока нет.'
                : 'Платёж ещё обрабатывается. Проверьте статус немного позже.',
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPaying(false);
    }
  }
  useEffect(() => {
    if (checked.current) return;
    if (params.get('nicknamePayment') === 'return') {
      checked.current = true;
      void payment('check');
    } else if (params.get('nicknamePayment') === 'failed') {
      checked.current = true;
      setError('Оплата не завершена. Можно проверить её статус.');
    }
  }, [params]);
  const choose = (patch: Partial<NicknameStyle>) =>
    onChange({ ...selected, ...patch });
  return (
    <div className="nickname-studio">
      <div className="nickname-studio-intro">
        <div>
          <span className="nickname-kicker">ТВОЙ СТИЛЬ В КАЖДОЙ РЕПЛИКЕ</span>
          <h3>Ник с характером</h3>
          <p>
            20 цветов и пять эффектов. Настройте свой ник для профиля,
            комментариев, рейтингов и совместного просмотра.
          </p>
        </div>
        <span className="nickname-permanent">
          {unlocked ? 'Открыто навсегда' : 'Одна покупка · навсегда'}
        </span>
      </div>
      {!unlocked && (
        <div className="nickname-purchase">
          <div>
            <strong>{NICKNAME_PRICE.toLocaleString('ru-RU')} ₽</strong>
            <p>
              Весь набор навсегда для этого аккаунта. Переключайтесь бесплатно.
              Покупка учитывается в рейтинге поддержки.
            </p>
            <small>
              Предпросмотр доступен до покупки. Нажимая «Купить», вы принимаете{' '}
              <Link href="/legal/offer">оферту</Link>.
            </small>
          </div>
          <div className="nickname-purchase-actions">
            <button
              type="button"
              className="hub-primary"
              disabled={paying || busy}
              onClick={() => void payment('buy')}
            >
              {paying ? 'Подождите…' : 'Купить навсегда · 5 000 ₽'}
            </button>
            <button
              type="button"
              className="hub-button"
              disabled={paying || busy}
              onClick={() => void payment('check')}
            >
              Проверить оплату
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="hub-error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="hub-notice">
          {notice}
        </p>
      )}
      <fieldset disabled={busy || paying}>
        <legend>Цвет ника</legend>
        <div className="nickname-color-grid">
          <button
            type="button"
            className={`nickname-color ${selected.color === 'default' ? 'selected' : ''}`}
            aria-pressed={selected.color === 'default'}
            onClick={() =>
              onChange({ color: 'default', effect: 'solid', motion: false })
            }
          >
            <i className="nickname-swatch-default" />
            Обычный
          </button>
          {nicknameColors.map(([id, name, color, light]) => (
            <button
              type="button"
              key={id}
              className={`nickname-color ${selected.color === id ? 'selected' : ''}`}
              aria-pressed={selected.color === id}
              onClick={() => choose({ color: id })}
            >
              <i
                style={{
                  background: `linear-gradient(135deg,${color},${light})`,
                }}
              />
              {name}
            </button>
          ))}
          {!!user.legend_origin_at && (
            <button
              type="button"
              className={`nickname-color ${selected.color === 'legend' ? 'selected' : ''}`}
              aria-pressed={selected.color === 'legend'}
              onClick={() =>
                onChange({ color: 'legend', effect: 'shimmer', motion: true })
              }
            >
              <i className="nickname-swatch-legend" />
              Исток легенды
            </button>
          )}
        </div>
      </fieldset>
      <fieldset
        disabled={
          busy || paying || ['default', 'legend'].includes(selected.color)
        }
      >
        <legend>Эффект</legend>
        <div className="nickname-effect-grid">
          {nicknameEffects.map(([id, label]) => (
            <button
              type="button"
              key={id}
              className={`nickname-effect ${selected.effect === id ? 'selected' : ''}`}
              aria-pressed={selected.effect === id}
              onClick={() => choose({ effect: id })}
            >
              <UserNickname
                user={{
                  nick: user.nick,
                  nickname_style: { ...selected, effect: id },
                }}
              />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="nickname-motion">
        <input
          type="checkbox"
          checked={selected.motion}
          disabled={busy || paying || selected.color === 'default'}
          onChange={(event) => choose({ motion: event.target.checked })}
        />
        Анимация{' '}
        <small>
          Системная настройка уменьшения движения учитывается автоматически.
        </small>
      </label>
      {!unlocked && !['default', 'legend'].includes(selected.color) && (
        <p className="hub-lead">
          Это предпросмотр. Сохранение выбранного цвета станет доступно после
          покупки.
        </p>
      )}
    </div>
  );
}

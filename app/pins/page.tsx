'use client';
import { useEffect, useState } from 'react';
import { Gem, Check, Lock } from 'lucide-react';
import {
  CommunityHeader,
  useCommunity,
  Avatar,
  Pin,
} from '@/components/community/context';
import { BuySubscription } from '@/components/community/buy-subscription';
import { pins } from '@/lib/community';
export default function PinsPage() {
  const c = useCommunity(),
    [selected, setSelected] = useState(pins[0].id),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function payment(action = 'create') {
    if (!c.user) {
      c.login();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const x = (await r.json()) as {
        error?: string;
        url?: string;
        status?: string;
      };
      if (!r.ok) throw Error(x.error);
      if (x.url) location.assign(x.url);
      else {
        setNotice(
          x.status === 'succeeded'
            ? 'Оплата подтверждена. Подписка активна.'
            : 'Оплата ещё не подтверждена. Можно проверить снова.',
        );
        await c.refresh();
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (
      c.user &&
      new URLSearchParams(location.search).get('payment') === 'return'
    )
      void payment('check');
  }, [c.user?.id]);
  async function equip() {
    if (!c.user) return;
    setBusy(true);
    try {
      const response = await fetch('/api/cosmetics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'pin', slug: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Пин недоступен');
      await c.refresh();
      setNotice('Пин установлен над твоим ником.');
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="pins-page">
        <div className="pins-intro">
          <div>
            <span className="eyebrow">
              <Gem size={17} /> ANIMONSTER PLUS
            </span>
            <h1>
              Любимый тайтл.
              <br />
              <em>Прямо над ником.</em>
            </h1>
            <p>
              Один пин на каждый тайтл. Выбирай свой и меняй его под настроение
              — в профиле, на стенке и под видео.
            </p>
            <div className="subscription-price">
              89 ₽ <span>/ месяц</span>
            </div>
            <p className="platega-review-label" role="note">
              Platega test
            </p>
            <nav
              className="payment-doc-links"
              aria-label="Документы и условия оплаты"
            >
              <a href="/legal/prices">Цены и тарифы</a>
              <a href="/legal/offer">Публичная оферта</a>
              <a href="/legal/terms">Пользовательское соглашение</a>
              <a href="/legal/privacy">Политика конфиденциальности</a>
              <a href="/legal/support">Поддержка</a>
            </nav>
            <p className="billing-note">
              30 дней доступа ко всей коллекции. Продление вручную, без
              автоматических списаний.
            </p>
            {c.user?.premium_until ? (
              <>
                <p className="success-msg">
                  Подписка до{' '}
                  {new Date(c.user.premium_until).toLocaleDateString('ru-RU')}
                </p>
                <button className="primary" disabled={busy} onClick={equip}>
                  Установить выбранный пин <Check size={17} />
                </button>
              </>
            ) : (
              <BuySubscription className="primary" />
            )}
            {!c.paymentsReady && (
              <p className="setup-note">
                Покупка скоро появится. Пока можно бесплатно примерить все пины.
              </p>
            )}
            {error && (
              <p className="error-msg" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="success-msg" role="status">
                {notice}
              </p>
            )}
          </div>
          <div className="pin-preview-card">
            <span className="eyebrow small">ПРИМЕРКА · ВИД В КОММЕНТАРИЯХ</span>
            <div className="preview-comment">
              <Avatar large avatar={c.user?.avatar} theme={c.user?.theme} />
              <div>
                <div className="preview-name-row">
                  <strong>{c.user?.nick || 'Твой ник'}</strong>
                  <Pin id={selected} />
                </div>
                <p>Кажется, я нашёл своё любимое аниме.</p>
              </div>
            </div>
            <div className="preview-features">
              <span>
                <Check size={16} /> Справа от ника в профиле
              </span>
              <span>
                <Check size={16} /> В каждом комментарии
              </span>
              <span>
                <Check size={16} /> Можно менять в любой момент
              </span>
            </div>
            <p className="muted">
              Это предпросмотр. Пин сохраняется в профиле после активации
              подписки.
            </p>
          </div>
        </div>
        <section className="pins-catalog">
          <div className="panel-title">
            <h2>Пиксельная коллекция</h2>
            <span>30 тайтлов · все входят в Plus</span>
          </div>
          <div className="pin-grid">
            {pins.map((p) => (
              <button
                key={p.id}
                className={'pin-card ' + (selected === p.id ? 'selected' : '')}
                onClick={() => setSelected(p.id)}
              >
                <div className="pin-art">
                  <img
                    src={p.image}
                    alt={p.name}
                    loading="lazy"
                    decoding="async"
                    width={128}
                    height={128}
                  />
                  {selected === p.id ? <Check size={20} /> : <Lock size={17} />}
                </div>
                <strong className="pin-name">{p.name}</strong>
                <span className="pin-subject">{p.label}</span>
                <span>
                  {selected === p.id ? 'На примерке' : 'Примерить пин'}
                </span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

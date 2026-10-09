'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, ChevronRight, Download, FileDown, Monitor, ShieldAlert } from 'lucide-react';
import { CommunityHeader, useCommunity } from '@/components/community/context';

type Device = {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'revoking' | 'error';
  created_at: number;
};
type Overview = {
  expiresAt: number;
  active: boolean;
  maxDevices: number;
  purchase: { available: boolean; price: number; days: number;
    bundleAvailable: boolean; bundlePrice: number };
  devices: Device[];
};

async function api(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, { cache: 'no-store', ...init });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Не удалось выполнить действие');
  return data;
}

const statusText: Record<Device['status'], string> = {
  pending: 'Создаём профиль',
  active: 'Готово',
  revoking: 'Отключаем',
  error: 'Ошибка выдачи',
};

const appDownloads = [
  { label: 'iOS', href: 'https://apps.apple.com/app/amneziawg/id6478942365' },
  { label: 'Android', href: 'https://play.google.com/store/apps/details?id=org.amnezia.awg' },
  { label: 'Windows', href: 'https://github.com/amnezia-vpn/amneziawg-windows-client/releases/latest' },
  { label: 'macOS', href: 'https://apps.apple.com/app/amneziawg/id6478942365' },
] as const;

export function VpnPage() {
  const community = useCommunity();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    if (!community.user) return;
    try {
      setOverview(await api('/api/vpn'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось загрузить VPN');
    }
  }, [community.user]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!community.user) return;
    const search = new URLSearchParams(window.location.search);
    if (search.get('payment') === 'failed') {
      setError('Оплата не завершена. Доступ не изменился.');
      return;
    }
    if (search.get('payment') !== 'return') return;
    const plan = search.get('plan') === 'vpn_plus' ? 'vpn_plus' : 'vpn';
    let cancelled = false;
    async function check() {
      try {
        const result = await api('/api/payments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'check', plan }),
        });
        if (cancelled) return;
        if (result.status === 'succeeded') {
          setNotice(plan === 'vpn_plus' ? 'Оплата подтверждена. VPN и Plus активированы.' :
            'Оплата подтверждена. VPN активирован.');
          await refresh();
        } else setNotice('Платёж обрабатывается. Обновите страницу через минуту.');
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Не удалось проверить платёж');
      }
    }
    void check();
    return () => { cancelled = true; };
  }, [community.user, refresh]);
  useEffect(() => {
    if (!overview?.devices.some((device) => device.status === 'pending' || device.status === 'revoking')) return;
    const timer = setInterval(() => { void refresh(); }, 4000);
    return () => clearInterval(timer);
  }, [overview, refresh]);

  async function mutate(input: Record<string, string>) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('/api/vpn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (input.action === 'create') setName('');
      setNotice(input.action === 'create' ? 'Готовим настройки устройства' : 'Устройство отключается');
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось выполнить действие');
    } finally {
      setBusy(false);
    }
  }

  async function buyVpn(plan: 'vpn' | 'vpn_plus') {
    setBusy(true);
    setError('');
    try {
      const result = await api('/api/payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось начать оплату');
      setBusy(false);
    }
  }

  const count = overview?.devices.length || 0;
  return (
    <div className="social-site">
      <CommunityHeader />
      <main className="vpn-page">
        <nav className="vpn-breadcrumb" aria-label="Навигация"><a href="/">Главная</a><ChevronRight size={15} aria-hidden="true" /><span>VPN</span></nav>
        <h1>Ваш VPN</h1>
        <p className="vpn-intro">Управляйте подпиской и подключёнными устройствами.</p>
        {!community.user ? (
          <section className="vpn-card">
            <h2>Войдите в аккаунт</h2>
            <p>После входа здесь появятся срок доступа и ваши устройства.</p>
            <button onClick={community.login}>Войти</button>
          </section>
        ) : (
          <>
            <section className="vpn-card vpn-status-card">
              <div className="vpn-status-main">
                <span className={`vpn-label${overview?.active ? ' is-active' : ''}`}><i aria-hidden="true" />Подписка</span>
                <h2>{overview?.active ? 'Активна' : 'Не активна'}</h2>
                <p>{overview?.active
                  ? `Действует до ${new Date(overview.expiresAt).toLocaleDateString('ru-RU')}`
                  : overview?.purchase.available ? 'Подключите VPN на 30 дней.' :
                    'Покупка VPN появится после запуска оплаты.'}</p>
                {overview?.purchase.available && (
                  <>
                    <div className="vpn-price"><strong>{overview.purchase.price} ₽</strong><span>/ {overview.purchase.days} дней</span></div>
                    <button className="vpn-buy" disabled={busy} onClick={() => void buyVpn('vpn')}>
                      {overview.active ? 'Продлить подписку' : 'Оформить подписку'} <ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </>
                )}
              </div>
              <div className="vpn-device-count">{count} / {overview?.maxDevices || 5}<small>устройств</small></div>
            </section>
            {overview?.purchase.bundleAvailable && (
              <section className="vpn-card vpn-bundle-card">
                <span className="vpn-label">Комплект</span>
                <h2>VPN + AniMonster Plus</h2>
                <p>Оба доступа на 30 дней. Если один уже активен, к его оставшемуся сроку добавятся 30 дней.</p>
                <div className="vpn-bundle-action">
                  <button disabled={busy} onClick={() => void buyVpn('vpn_plus')}>
                    Купить комплект · {overview.purchase.bundlePrice} ₽
                  </button>
                  <span>По отдельности 258 ₽</span>
                </div>
              </section>
            )}
            {overview?.active && (
              <section className="vpn-card">
                <h2>Добавить устройство</h2>
                <p>Назовите его так, чтобы потом легко найти в списке.</p>
                <form onSubmit={(event) => {
                  event.preventDefault();
                  void mutate({ action: 'create', name });
                }} className="vpn-device-form">
                  <input value={name} onChange={(event) => setName(event.target.value)}
                    maxLength={40} placeholder="Например, мой iPhone" aria-label="Название устройства" required />
                  <button disabled={busy || count >= 5 || !name.trim()}>Добавить</button>
                </form>
              </section>
            )}
            <section className="vpn-card">
              <h2>Устройства</h2>
              {!count && <>
                <p>Здесь появятся ваши устройства после активации подписки.</p>
                <div className="vpn-empty-device"><Monitor size={45} strokeWidth={1.5} aria-hidden="true" /><strong>Пока нет подключённых устройств</strong><span>Активируйте подписку, чтобы добавить устройство.</span></div>
              </>}
              <div className="vpn-device-list">
                {overview?.devices.map((device) => (
                  <article className="vpn-device" key={device.id}>
                    <div>
                      <strong>{device.name}</strong>
                      <span>{statusText[device.status]}</span>
                    </div>
                    <div className="vpn-device-actions">
                      {device.status === 'active' && overview.active && (
                        <>
                          <a href={`/api/vpn?device=${encodeURIComponent(device.id)}&format=awg`} download><Download size={16} aria-hidden="true" /> Профиль AmneziaWG</a>
                          <a href={`/api/vpn?device=${encodeURIComponent(device.id)}&format=xray`} download><Download size={16} aria-hidden="true" /> Резервный XRay</a>
                        </>
                      )}
                      {device.status !== 'revoking' && (
                        <button className="vpn-danger" disabled={busy}
                          onClick={() => {
                            if (confirm(`Отключить «${device.name}»?`))
                              void mutate({ action: 'revoke', id: device.id });
                          }}>Отключить</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            <section className="vpn-card vpn-guide-card">
              <h2>Как подключиться</h2>
              <p>Скачайте приложение AmneziaWG, импортируйте профиль и подключитесь.</p>
              <div className="vpn-steps">
                <div className="vpn-step"><span className="vpn-step-number">1</span><div><strong>Установите AmneziaWG</strong><p>Выберите приложение для своего устройства.</p></div></div>
                <div className="vpn-step"><span className="vpn-step-number">2</span><div><strong>Скачайте профиль</strong><p>Добавьте устройство выше и скачайте его профиль AmneziaWG.</p></div></div>
                <div className="vpn-step"><span className="vpn-step-number">3</span><div><strong>Импортируйте и подключитесь</strong><p>Откройте профиль в приложении и включите VPN.</p></div></div>
              </div>
              <div className="vpn-downloads" aria-label="Скачать AmneziaWG">
                {appDownloads.map((app) => <a key={app.label} href={app.href} target="_blank" rel="noopener noreferrer"><Download size={16} aria-hidden="true" />{app.label}</a>)}
              </div>
              <div className="vpn-guide-notes"><p><FileDown size={18} aria-hidden="true" />Если соединение не работает, скачайте резервный профиль XRay из карточки устройства и импортируйте его в приложение с поддержкой VLESS Reality.</p><p><ShieldAlert size={19} aria-hidden="true" />Профиль содержит приватный ключ. Не передавайте его другим людям.</p></div>
            </section>
          </>
        )}
        {error && <p className="vpn-message vpn-error" role="alert">{error}</p>}
        {notice && <p className="vpn-message" role="status">{notice}</p>}
      </main>
    </div>
  );
}

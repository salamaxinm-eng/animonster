'use client';
import { useEffect, useState } from 'react';
import { ShieldCheck, MonitorSmartphone } from 'lucide-react';
import { useCommunity } from './context';
import { qrRequest } from '@/lib/client/qr-login';
import { validQrId, validQrSecret } from '@/lib/qr-login';

type Confirmation = {
  id: string;
  device: string;
  code: string;
  expiresAt: number;
  status: string;
};
export function QrConfirmation() {
  const community = useCommunity();
  const [proof, setProof] = useState<{ id: string; token: string } | null>(
      null,
    ),
    [flow, setFlow] = useState<Confirmation | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [matched, setMatched] = useState(false),
    [seconds, setSeconds] = useState(0);
  useEffect(() => {
    let raw = location.hash.slice(1);
    if (raw) {
      try {
        sessionStorage.setItem(
          'am-qr-confirmation',
          JSON.stringify({ raw, expires: Date.now() + 120000 }),
        );
      } catch {}
      history.replaceState(null, '', location.pathname);
    } else {
      try {
        const stored = JSON.parse(
          sessionStorage.getItem('am-qr-confirmation') || 'null',
        );
        if (stored?.expires > Date.now()) raw = stored.raw;
      } catch {}
    }
    const [id, token, extra] = raw.split('.');
    if (!validQrId(id) || !validQrSecret(token) || extra) {
      setError(
        'Ссылка недействительна. Отсканируйте новый QR-код на компьютере.',
      );
      return;
    }
    const controller = new AbortController();
    setProof({ id, token });
    void qrRequest({ action: 'inspect', id, token }, controller.signal)
      .then((data) => {
        setFlow(data);
        setSeconds(
          Math.max(0, Math.ceil((data.expiresAt - Date.now()) / 1000)),
        );
      })
      .catch((reason) => {
        if (reason.name !== 'AbortError') setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!flow || flow.status !== 'pending') return;
    const timer = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.ceil((flow.expiresAt - Date.now()) / 1000)),
        ),
      1000,
    );
    return () => clearInterval(timer);
  }, [flow]);
  useEffect(() => setMatched(false), [community.user?.id]);
  async function decide(approve: boolean) {
    if (!proof || !flow || busy || (approve && (!matched || !community.user)))
      return;
    setBusy(true);
    setError('');
    try {
      const result = await qrRequest({
        action: approve ? 'approve' : 'deny',
        ...proof,
        userId: community.user?.id || null,
      });
      setFlow({ ...flow, status: result.status });
      try {
        sessionStorage.removeItem('am-qr-confirmation');
      } catch {}
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page qr-confirm-page ym-hide-content">
      <section className="social-panel auth-card qr-confirm-card">
        <ShieldCheck size={36} aria-hidden="true" />
        <span className="eyebrow">ANIMONSTER / ВХОД ПО QR</span>
        <h1>Подтверждение входа</h1>
        {!flow && !error && <p role="status">Проверяем QR-код…</p>}
        {flow?.status === 'pending' && (
          <>
            <div className="qr-device">
              <MonitorSmartphone size={28} aria-hidden="true" />
              <strong>{flow.device}</strong>
            </div>
            <p>На компьютере должен отображаться такой же код:</p>
            <strong className="qr-match-code">{flow.code}</strong>
            <p className="qr-security-note">
              Подтверждайте только вход на своём устройстве. Если этот QR-код
              прислал кто-то другой — отклоните запрос.
            </p>
            {seconds > 0 ? (
              <>
                {community.loaded &&
                  (community.user ? (
                    <>
                      <p>
                        Войти на компьютере как{' '}
                        <strong>{community.user.nick}</strong>
                      </p>
                      <label className="qr-match-check">
                        <input
                          type="checkbox"
                          checked={matched}
                          onChange={(event) => setMatched(event.target.checked)}
                        />
                        Это моё устройство, код совпадает
                      </label>
                      <button
                        type="button"
                        className="primary"
                        disabled={busy || !matched}
                        onClick={() => void decide(true)}
                      >
                        {busy ? 'Подтверждаем…' : 'Подтвердить вход'}
                      </button>
                    </>
                  ) : (
                    <>
                      <p>
                        Сначала войдите в AniMonster на этом телефоне. При входе
                        через соцсеть повторно отсканируйте QR-код после
                        возвращения на сайт.
                      </p>
                      <button
                        type="button"
                        className="primary"
                        onClick={community.login}
                      >
                        Войти на телефоне
                      </button>
                    </>
                  ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(false)}
                >
                  Отклонить запрос
                </button>
                <small>Осталось {seconds} сек.</small>
              </>
            ) : (
              <p role="status">
                Время истекло. Создайте новый QR-код на компьютере.
              </p>
            )}
          </>
        )}
        {flow && flow.status !== 'pending' && (
          <p role="status">
            {flow.status === 'approved'
              ? 'Вход подтверждён. Компьютер войдёт автоматически, эту страницу можно закрыть.'
              : flow.status === 'consumed'
                ? 'Этот QR-код уже использован.'
                : 'Запрос отклонён. Вход не выполнен.'}
          </p>
        )}
        {error && (
          <p className="error-msg" role="alert">
            {error}
          </p>
        )}
        <a href="/">На главную</a>
      </section>
    </main>
  );
}

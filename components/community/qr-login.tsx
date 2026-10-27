'use client';
import { useEffect, useRef, useState } from 'react';
import { QrCode } from 'lucide-react';
import { qrRequest } from '@/lib/client/qr-login';

type Flow = {
  id: string;
  image: string;
  code: string;
  expiresAt: number;
  device: string;
};
export function QrLogin({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [open, setOpen] = useState(false),
    [flow, setFlow] = useState<Flow | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [seconds, setSeconds] = useState(0);
  const current = useRef<string | null>(null),
    mounted = useRef(true),
    creating = useRef(false),
    done = useRef(onSuccess);
  done.current = onSuccess;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (current.current)
        void qrRequest({ action: 'cancel', id: current.current }).catch(
          () => {},
        );
    };
  }, []);
  async function create() {
    if (creating.current) return;
    creating.current = true;
    setBusy(true);
    setError('');
    setFlow(null);
    setOpen(true);
    if (current.current)
      void qrRequest({ action: 'cancel', id: current.current }).catch(() => {});
    current.current = null;
    try {
      const value = (await qrRequest({ action: 'create' })) as Flow;
      if (!mounted.current) {
        void qrRequest({ action: 'cancel', id: value.id }).catch(() => {});
        return;
      }
      current.current = value.id;
      setSeconds(Math.max(0, Math.ceil((value.expiresAt - Date.now()) / 1000)));
      setFlow(value);
    } catch (reason) {
      if (mounted.current) setError((reason as Error).message);
    } finally {
      creating.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (!flow) return;
    const controller = new AbortController();
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    const ticker = setInterval(
      () =>
        setSeconds(
          Math.max(0, Math.ceil((flow.expiresAt - Date.now()) / 1000)),
        ),
      1000,
    );
    async function poll() {
      if (stopped) return;
      if (Date.now() >= flow!.expiresAt) {
        setError('Срок действия QR-кода истёк. Создайте новый.');
        return;
      }
      if (document.hidden) {
        timer = setTimeout(poll, 2500);
        return;
      }
      try {
        const result = await qrRequest(
          { action: 'poll', id: flow!.id },
          controller.signal,
        );
        if (stopped) return;
        if (result.status === 'approved') {
          await qrRequest(
            { action: 'consume', id: flow!.id },
            controller.signal,
          );
          if (stopped) return;
          current.current = null;
          await done.current();
          return;
        }
        if (result.status !== 'pending') {
          setError('Этот QR-код закрыт или уже использован. Создайте новый.');
          return;
        }
      } catch (reason) {
        if (stopped || (reason as Error).name === 'AbortError') return;
        const code = (reason as Error & { code?: string }).code;
        if (code) {
          setError((reason as Error).message);
          return;
        }
        // A short network interruption must not invalidate a still-live code.
      }
      if (!stopped) timer = setTimeout(poll, 2500);
    }
    timer = setTimeout(poll, 2000);
    return () => {
      stopped = true;
      controller.abort();
      clearInterval(ticker);
      clearTimeout(timer);
    };
  }, [flow]);
  function close() {
    setFlow(null);
    setOpen(false);
    setError('');
    if (current.current)
      void qrRequest({ action: 'cancel', id: current.current }).catch(() => {});
    current.current = null;
  }
  return (
    <section className="qr-login ym-hide-content">
      {!open ? (
        <button
          type="button"
          className="qr-login-toggle"
          onClick={() => void create()}
        >
          <QrCode size={20} aria-hidden="true" />
          Войти по QR-коду
        </button>
      ) : (
        <>
          <h3>Вход с телефона</h3>
          <p>
            Отсканируйте код камерой телефона, где вы уже вошли в AniMonster.
            Затем подтвердите вход.
          </p>
          {busy && <p role="status">Создаём QR-код…</p>}
          {flow && !error && (
            <>
              <img
                className="qr-login-image"
                src={flow.image}
                width={240}
                height={240}
                alt="QR-код для подтверждения входа с телефона"
              />
              <p>
                Код на обоих устройствах:{' '}
                <strong className="qr-match-code">{flow.code}</strong>
              </p>
              <small>
                {flow.device} · Осталось {seconds} сек.
              </small>
            </>
          )}
          {error && (
            <>
              <p role="alert" className="error-msg">
                {error}
              </p>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void create()}
              >
                Новый QR-код
              </button>
            </>
          )}
          <button
            type="button"
            className="qr-login-back"
            disabled={busy}
            onClick={close}
          >
            Другой способ входа
          </button>
        </>
      )}
    </section>
  );
}

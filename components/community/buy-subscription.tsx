'use client';
import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useCommunity } from './context';
type Checkout = { render: (id: string) => Promise<void>; destroy: () => void };
declare global {
  interface Window {
    YooMoneyCheckoutWidget?: new (options: Record<string, unknown>) => Checkout;
  }
}
let script: Promise<void> | undefined;
function loadScript() {
  return (script ||= new Promise<void>((resolve, reject) => {
    if (window.YooMoneyCheckoutWidget) {
      resolve();
      return;
    }
    const el = document.createElement('script');
    el.src = 'https://yookassa.ru/checkout-widget/v1/checkout-widget.js';
    el.onload = () => resolve();
    el.onerror = () => {
      script = undefined;
      el.remove();
      reject(Error('Не удалось загрузить форму ЮKassa'));
    };
    document.head.appendChild(el);
  }));
}
export function BuySubscription({
  className = 'outline-button',
}: {
  className?: string;
}) {
  const c = useCommunity(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [ready, setReady] = useState(false),
    widget = useRef<Checkout | null>(null),
    generation = useRef(0);
  useEffect(() => {
    if (!open) {
      generation.current++;
      widget.current?.destroy();
      widget.current = null;
      setReady(false);
      setBusy(false);
    }
    return () => {
      widget.current?.destroy();
    };
  }, [open]);
  async function pay() {
    if (!c.user) {
      setOpen(false);
      c.login();
      return;
    }
    setBusy(true);
    setError('');
    const current = ++generation.current;
    try {
      await loadScript();
      const r = await fetch('/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create' }),
      });
      const x = (await r.json()) as any;
      if (!r.ok) throw Error(x.error);
      if (current !== generation.current) return;
      widget.current?.destroy();
      widget.current = new window.YooMoneyCheckoutWidget!({
        confirmation_token: x.confirmation_token,
        return_url: location.origin + '/pins?payment=return',
        error_callback: () =>
          setError(
            'Платёжная форма сообщила об ошибке. Обновите её и попробуйте снова.',
          ),
      });
      await widget.current.render('animonster-checkout');
      setReady(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className={className}
        onClick={() => {
          setOpen(true);
          setError('');
        }}
      >
        Купить подписку
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sign-dialog">
          <DialogTitle>AniMonster Plus · 89 ₽ / месяц</DialogTitle>
          <DialogDescription>
            Вся коллекция пинов для профиля и комментариев. Продление вручную,
            без автоматических списаний.
          </DialogDescription>
          <p className="muted">
            Качество видео остаётся доступным по условиям источника.
          </p>
          <div id="animonster-checkout" />
          {!ready && (
            <Button
              disabled={busy || !c.paymentsReady || c.preview}
              onClick={pay}
            >
              {busy ? 'Открываем ЮKassa…' : 'Перейти к оплате'}
            </Button>
          )}
          {!c.paymentsReady && (
            <p className="setup-note">
              Приём платежей ещё не подключён. Деньги не списываются.
            </p>
          )}
          {c.preview && (
            <p className="setup-note">Для покупки нужен обычный аккаунт.</p>
          )}
          {error && (
            <p className="error-msg" role="alert">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

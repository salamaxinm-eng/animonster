'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function EmailForm({ onSuccess }: { onSuccess: (pendingVerification?: boolean) => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [forgot, setForgot] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="email-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        setMessage('');
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch(forgot ? '/api/auth/password' : '/api/auth/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: forgot ? 'request' : register ? 'register' : 'login',
              email: data.get('email'),
              password: data.get('password'),
              nick: data.get('nick'),
              invite: data.get('invite'),
            }),
          });
          const x = (await r.json()) as any;
          if (!r.ok) throw Error(x.error);
          if (forgot) setMessage(x.message);
          else await onSuccess(!!x.pending_verification);
        } catch (e) {
          setError((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {register && (
        <label>
          Ник
          <Input
            name="nick"
            required
            minLength={3}
            maxLength={24}
            autoComplete="nickname"
          />
        </label>
      )}
      {register && (
        <label>
          Код приглашения
          <Input name="invite" required minLength={8} maxLength={64} autoComplete="off" />
        </label>
      )}
      <label>
        Email
        <Input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
        />
      </label>
      {!forgot && <label>
        Пароль
        <Input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={10} maxLength={72} />
      </label>}
      {register && <small>От 10 символов. Email используется для входа.</small>}
      {error && (
        <p role="alert" className="error-msg">
          {error}
        </p>
      )}
      {message && <p role="status" className="success-msg">{message}</p>}
      <Button type="submit" disabled={busy}>
        {busy ? 'Подождите…' : forgot ? 'Отправить ссылку' : register ? 'Создать аккаунт' : 'Войти'}
      </Button>
      {!register && <Button variant="ghost" type="button" onClick={() => { setForgot(!forgot); setError(''); setMessage(''); }}>
        {forgot ? 'Вернуться ко входу' : 'Не помню пароль'}
      </Button>}
      <Button
        variant="ghost"
        type="button"
        onClick={() => {
          setRegister(!register);
          setForgot(false);
          setError('');
          setMessage('');
        }}
      >
        {register
          ? 'Уже есть аккаунт? Войти'
          : 'Нет аккаунта? Зарегистрироваться'}
      </Button>
    </form>
  );
}

'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
export function EmailForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const [register, setRegister] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="email-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError('');
        const data = new FormData(e.currentTarget);
        try {
          const r = await fetch('/api/auth/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: register ? 'register' : 'login',
              email: data.get('email'),
              password: data.get('password'),
              nick: data.get('nick'),
            }),
          });
          const x = (await r.json()) as any;
          if (!r.ok) throw Error(x.error);
          await onSuccess();
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
      <label>
        Пароль
        <Input
          name="password"
          type="password"
          autoComplete={register ? 'new-password' : 'current-password'}
          required
          minLength={10}
          maxLength={72}
        />
      </label>
      {register && <small>От 10 символов. Email используется для входа.</small>}
      {error && (
        <p role="alert" className="error-msg">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy}>
        {busy ? 'Подождите…' : register ? 'Создать аккаунт' : 'Войти'}
      </Button>
      <Button
        variant="ghost"
        type="button"
        onClick={() => {
          setRegister(!register);
          setError('');
        }}
      >
        {register
          ? 'Уже есть аккаунт? Войти'
          : 'Нет аккаунта? Зарегистрироваться'}
      </Button>
    </form>
  );
}

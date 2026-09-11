'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

function ResetPasswordForm() {
  const token = useSearchParams().get('token') || '';
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError('');
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/auth/password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'reset', token, password: form.get('password') }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDone(true);
    } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); }
  }
  return <main className="auth-page">
    <section className="social-panel auth-card">
      <span className="eyebrow">ANIMONSTER / БЕЗОПАСНОСТЬ</span>
      <h1>Новый пароль</h1>
      {done ? <><p>Пароль изменён. Все прежние сессии завершены.</p><Link href="/profile">Войти в аккаунт →</Link></> :
        <form className="email-form" onSubmit={submit}>
          <label>Пароль<Input name="password" type="password" required minLength={10} maxLength={72} autoComplete="new-password" /></label>
          {error && <p role="alert" className="error-msg">{error}</p>}
          <Button disabled={busy || token.length < 40}>{busy ? 'Сохраняем…' : 'Сохранить пароль'}</Button>
        </form>}
    </section>
  </main>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-page"><p>Загружаем…</p></main>}><ResetPasswordForm /></Suspense>;
}

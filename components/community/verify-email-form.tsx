'use client';
import { FeedbackMessage } from '@/components/feedback-message';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function VerifyEmailForm({
  initialEmail,
  confirmed,
}: {
  initialEmail: string;
  confirmed: boolean;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/auth/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resend', email }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Не удалось отправить письмо.');
      setMessage(result.message);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось отправить письмо.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="social-panel auth-card">
        <span className="eyebrow">ANIMONSTER / АККАУНТ</span>
        <h1>Подтверждение email</h1>
        {confirmed ? (
          <p>Подтверждение почты для вашего аккаунта уже не требуется.</p>
        ) : (
          <>
            <p>Получите письмо и перейдите по ссылке в нём, чтобы подтвердить почту.</p>
            <form className="email-form" onSubmit={submit}>
              <label>
                Email аккаунта
                <Input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value);
                    setMessage('');
                    setError('');
                  }}
                />
              </label>
              {error && <p role="alert" className="error-msg"><FeedbackMessage>{error}</FeedbackMessage></p>}
              {message && <p role="status" className="success-msg"><FeedbackMessage>{message}</FeedbackMessage></p>}
              <Button type="submit" disabled={busy}>
                {busy ? 'Отправляем…' : message ? 'Отправить письмо ещё раз' : 'Отправить письмо подтверждения'}
              </Button>
            </form>
            <p>Если письма нет, проверьте папку «Спам» и правильность адреса.</p>
          </>
        )}
        <Link href="/profile">Вернуться в профиль →</Link>
      </section>
    </main>
  );
}

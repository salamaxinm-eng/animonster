'use client';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

export function AccountData() {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  return <section className="account-data">
    <h3>Данные аккаунта</h3>
    <a className="outline-button" href="/api/account" download>Скачать мои данные</a>
    <AlertDialog><AlertDialogTrigger render={<Button type="button" variant="destructive" />}>Удалить аккаунт</AlertDialogTrigger>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Удалить аккаунт безвозвратно?</AlertDialogTitle>
        <AlertDialogDescription>История и коллекция будут удалены, комментарии останутся от имени удалённого пользователя. Введите УДАЛИТЬ.</AlertDialogDescription></AlertDialogHeader>
        <Input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} aria-label="Подтверждение удаления" />
        {error && <p className="error-msg">{error}</p>}
        <AlertDialogFooter><AlertDialogCancel>Отмена</AlertDialogCancel><AlertDialogAction type="button" variant="destructive" disabled={confirmation !== 'УДАЛИТЬ'} onClick={async () => {
          const response = await fetch('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) });
          const data = await response.json();
          if (!response.ok) setError(data.error); else location.href = '/';
        }}>Удалить</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </section>;
}

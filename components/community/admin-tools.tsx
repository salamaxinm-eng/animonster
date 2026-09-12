'use client';
import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export function AdminTools() {
  const [data, setData] = useState<any>({ can_manage_roles: false, invite_required: false, users: [], invites: [], reports: [], actions: [] });
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = async () => {
    const response = await fetch('/api/admin');
    if (response.ok) setData(await response.json());
  };
  useEffect(() => { void load(); }, []);
  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setCode('');
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_invite', label: form.get('label'), days: form.get('days') }) });
    const result = await response.json();
    if (!response.ok) { setError(result.error); return; }
    setCode(result.code); await load();
  }
  async function mutate(payload: Record<string, unknown>) {
    setError(''); setMessage('');
    const response = await fetch('/api/admin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const result = await response.json();
    if (!response.ok) { setError(result.error); return; }
    if (payload.action === 'grant_plus') setMessage(`Plus выдан до ${new Date(Number(result.premium_until)).toLocaleDateString('ru-RU')}`);
    else if (payload.action === 'role') setMessage('Роль обновлена');
    else setMessage('Изменение сохранено');
    await load();
  }
  return <div className="admin-tools">
    {data.invite_required && <section className="social-panel">
      <h2>Приглашения в бету</h2>
      <form className="admin-inline-form" onSubmit={createInvite}>
        <Input name="label" placeholder="Для кого" maxLength={80} />
        <Input name="days" type="number" min={1} max={90} defaultValue={14} aria-label="Срок, дней" />
        <Button type="submit">Создать инвайт</Button>
      </form>
      {code && <p className="invite-result">Скопируйте сейчас: <strong>{code}</strong></p>}
      {error && <p className="error-msg">{error}</p>}
      <p className="muted">Коды хранятся только в виде хеша и работают один раз.</p>
    </section>}
    <section className="social-panel">
      <h2>Пользователи</h2>
      {message && <p role="status" className="success-msg">{message}</p>}
      {error && <p role="alert" className="error-msg">{error}</p>}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Пользователь</th><th>Роль</th><th>Email</th><th>Действия</th></tr></thead><tbody>
        {data.users.map((user: any) => <tr key={user.id}><td>{user.nick}<small>{user.id}</small></td><td>{data.can_manage_roles ? <NativeSelect aria-label={`Роль ${user.nick}`} value={user.role} onChange={(event) => mutate({ action: 'role', user_id: user.id, role: event.target.value })}><option value="user">Пользователь</option><option value="moderator">Модератор</option><option value="admin">Администратор</option></NativeSelect> : user.role}</td><td>{user.email || 'VK'} {user.email_verified ? '✓' : ''}<small>{Number(user.premium_until) > Date.now() ? `Plus до ${new Date(Number(user.premium_until)).toLocaleDateString('ru-RU')}` : 'Бесплатный'}</small></td><td className="admin-actions">
          <Button type="button" size="sm" variant="outline" onClick={() => mutate({ action: 'grant_plus', user_id: user.id, days: 31, reason: 'Выдано администратором' })}>Выдать Plus на 31 день</Button>
          <Button size="sm" variant="outline" onClick={() => mutate({ action: 'suspend', user_id: user.id, hours: user.suspended_until ? 0 : 24, reason: 'Решение модератора' })}>{user.suspended_until ? 'Разблокировать' : 'Блок на сутки'}</Button>
        </td></tr>)}
      </tbody></table></div>
    </section>
  </div>;
}

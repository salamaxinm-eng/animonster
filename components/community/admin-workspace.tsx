'use client';
import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AdminTools } from './admin-tools';

const sections = [
  ['overview', 'Обзор'],
  ['health', 'Работа сайта'],
  ['users', 'Пользователи и Plus'],
  ['moderation', 'Модерация'],
  ['catalog', 'Каталог'],
  ['restrictions', 'Блокировки тайтлов'],
];
export function AdminWorkspace({
  data,
  children,
}: {
  data: any;
  children: ReactNode;
}) {
  const [section, setSection] = useState('overview');
  useEffect(() => {
    const sync = () => {
      const value = location.hash.slice(1);
      setSection(
        value === 'title-restrictions'
          ? 'restrictions'
          : sections.some(([id]) => id === value)
            ? value
            : 'overview',
      );
    };
    sync();
    window.addEventListener('hashchange', sync);
    return () => window.removeEventListener('hashchange', sync);
  }, []);
  const choose = (value: string) => {
    setSection(value);
    history.replaceState(null, '', '#' + value);
  };
  return (
    <div className="admin-workspace">
      <nav className="admin-primary-nav" aria-label="Разделы админки">
        <label className="admin-mobile-select">
          Раздел
          <select
            value={section}
            onChange={(event) => choose(event.target.value)}
          >
            {sections
              .filter(([id]) => id !== 'restrictions' || data.can_manage_roles)
              .map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
          </select>
        </label>
        <div className="admin-desktop-tabs">
          {sections
            .filter(([id]) => id !== 'restrictions' || data.can_manage_roles)
            .map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={section === id}
                onClick={() => choose(id)}
              >
                {label}
              </button>
            ))}
        </div>
      </nav>
      <div className="admin-shortcuts">
        <Link href="/admin/player-feedback">Отзывы о плеере</Link>
        <Link href="/admin/battlepass">AniMonster Pass</Link>
        <Link href="/admin/cosmetic-generator">Генератор наград</Link>
        <Link href="/profile?tab=moderation">Жалобы</Link>
      </div>
      <div hidden={section !== 'overview'}>{children}</div>
      <div hidden={section === 'overview'}>
        <AdminTools initialData={data} section={section} />
      </div>
    </div>
  );
}

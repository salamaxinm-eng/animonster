'use client';

import { useEffect, useState } from 'react';

export function PwaRegistration() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    void navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .catch(() => {});
  }, []);
  if (!offline) return null;
  return (
    <aside
      aria-label="Офлайн-просмотр"
      style={{
        position: 'fixed',
        bottom: 'calc(82px + env(safe-area-inset-bottom))',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 200,
        width: 'max-content',
        maxWidth: 'calc(100% - 24px)',
        padding: '12px 16px',
        borderRadius: 12,
        fontSize: 14,
        background: 'var(--card, #17181d)',
        color: 'var(--foreground, #fff)',
        border: '1px solid var(--border, #ffffff30)',
        boxShadow: '0 8px 28px #0006',
      }}
    >
      Вы офлайн ·{' '}
      <a
        href="/downloads"
        style={{
          color: 'var(--am-accent-light, #c39aff)',
          textDecoration: 'underline',
        }}
      >
        Открыть загрузки
      </a>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'animonster-rf-vpn-notice-dismissed-v1';

export function AccessNotice() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(STORAGE_KEY) !== '1');
    } catch {
      setVisible(true);
    }
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Keep it dismissed for this visit when persistent storage is unavailable.
    }
  }

  if (!visible) return null;

  return (
    <aside className="access-notice" aria-label="Доступность сайта">
      <ShieldAlert className="access-notice-icon" size={21} aria-hidden="true" />
      <p>
        Доступ к сайту в России могут ограничить. Чтобы не потерять возможность
        смотреть аниме, рекомендуем заранее настроить VPN.
      </p>
      <div className="access-notice-actions">
        <Link href="/vpn">Подключить VPN</Link>
        <button type="button" onClick={dismiss}>
          Больше не показывать
        </button>
      </div>
    </aside>
  );
}

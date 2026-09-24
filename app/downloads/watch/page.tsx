'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CommunityHeader } from '@/components/community/context';
import { OfflinePlayer } from '@/components/offline-player';

function OfflineWatchContent() {
  const id = useSearchParams().get('id') || '';
  return (
    <div className="social-site offline-page">
      <CommunityHeader />
      <main>
        <a href="/downloads">← Загрузки</a>
        <OfflinePlayer id={id} />
      </main>
    </div>
  );
}

export default function OfflineWatchPage() {
  return (
    <Suspense fallback={<p>Открываем локальную серию…</p>}>
      <OfflineWatchContent />
    </Suspense>
  );
}

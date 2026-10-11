import { Suspense } from 'react';
import { ProfileHub } from '@/components/community/profile-hub';
import '../profile-hub.css';
export default function Page() {
  return <Suspense fallback={<main className="hub-loading">Загрузка кабинета…</main>}><ProfileHub /></Suspense>;
}

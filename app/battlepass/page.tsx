import type { Metadata } from 'next';
import { Suspense } from 'react';
import { BattlepassPage } from '@/components/battlepass-page';
import '../profile-hub.css';
import './battlepass.css';
export const metadata: Metadata = { title: 'AniMonster Pass', description: 'Сезонный пропуск AniMonster. Смотри аниме, открывай уровни и получай оформление навсегда.' };
export default function Page() { return <Suspense fallback={<p>Загрузка AniMonster Pass…</p>}><BattlepassPage /></Suspense>; }

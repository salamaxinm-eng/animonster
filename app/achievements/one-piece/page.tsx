import type { Metadata } from 'next';
import { OnePieceJourney } from '@/components/one-piece-journey';
import './one-piece.css';
export const metadata: Metadata = {
  title: 'Достижения One Piece — твой пиратский путь',
  description:
    'Открывай арки Ван Пис, собирай достижения и награды, исследуй карту Гранд Лайн на AniMonster.',
  alternates: { canonical: '/achievements/one-piece' },
};
export default function Page() {
  return <OnePieceJourney />;
}

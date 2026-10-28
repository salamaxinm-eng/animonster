import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Рекомендации аниме',
  description:
    'Найдите следующее аниме для просмотра: рекомендации и подборки AniMonster.',
  alternates: { canonical: '/recommendations' },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

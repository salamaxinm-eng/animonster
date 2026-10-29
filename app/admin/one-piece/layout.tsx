import type { Metadata } from 'next';
export const metadata: Metadata = {
  title: 'Настройка достижений One Piece',
  robots: { index: false, follow: false },
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

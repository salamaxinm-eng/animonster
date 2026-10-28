import type { Metadata } from 'next';
import { cachedCatalogPage } from '@/lib/server/library';
import CatalogPage from './client-page';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Каталог аниме — сериалы и фильмы',
  description:
    'Каталог аниме AniMonster: выбирайте сериалы и фильмы по рейтингу, следите за онгоингами и находите новые тайтлы.',
  alternates: { canonical: '/catalog' },
  openGraph: {
    type: 'website',
    url: '/catalog',
    title: 'Каталог аниме | AniMonster',
    description: 'Аниме сериалы и фильмы, популярные тайтлы и онгоинги.',
  },
};

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const initialTab = (await searchParams).tab === 'ongoing' ? 'ongoing' : 'all';
  // Seed from local data: indexable cards without waiting for a provider API.
  const catalog = await cachedCatalogPage({
    limit: 24,
    sort: 'rating',
    status: initialTab === 'ongoing' ? 'ongoing' : '',
  }).catch(() => ({ items: [], total: 0 }));
  return (
    <CatalogPage
      key={initialTab}
      initialTab={initialTab}
      initialItems={catalog.items}
      initialPages={Math.max(1, Math.ceil(catalog.total / 24))}
    />
  );
}

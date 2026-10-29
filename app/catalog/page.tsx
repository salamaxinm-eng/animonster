import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cachedCatalogPage } from '@/lib/server/library';
import { listingUrl, listingSchema, pageNumber } from '@/lib/seo';
import { SeoJsonLd } from '@/components/seo-json-ld';
import CatalogPage from './client-page';
export const dynamic = 'force-dynamic';
type Props = {
  searchParams: Promise<{ tab?: string; page?: string; sort?: string }>;
};
export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const p = await searchParams;
  const page = pageNumber(p.page),
    tab = p.tab === 'ongoing' ? 'ongoing' : 'all';
  const title =
    (tab === 'ongoing'
      ? 'Онгоинги — аниме в эфире'
      : 'Каталог аниме — сериалы и фильмы') +
    (page > 1 ? ' — страница ' + page : '');
  return {
    title,
    description:
      title +
      '. Выбирайте аниме по рейтингу и находите новые тайтлы на AniMonster.',
    alternates: { canonical: listingUrl('/catalog', page, tab) },
    robots: p.sort === 'fresh' ? { index: false, follow: true } : undefined,
    openGraph: {
      title,
      url: listingUrl('/catalog', page, tab),
      type: 'website',
    },
  };
}
export default async function Page({ searchParams }: Props) {
  const p = await searchParams;
  const page = pageNumber(p.page),
    tab = p.tab === 'ongoing' ? 'ongoing' : 'all',
    sort = p.sort === 'fresh' ? 'fresh' : 'rating';
  const catalog = await cachedCatalogPage({
    limit: 24,
    offset: (page - 1) * 24,
    sort,
    status: tab === 'ongoing' ? 'ongoing' : '',
  });
  const pages = Math.max(1, Math.ceil(catalog.total / 24));
  if (page > pages) notFound();
  return (
    <>
      <SeoJsonLd
        data={listingSchema(
          tab === 'ongoing' ? 'Онгоинги' : 'Каталог аниме',
          listingUrl('/catalog', page, tab, sort),
          catalog.items,
          page,
        )}
      />
      <CatalogPage
        initialTab={tab}
        initialItems={catalog.items}
        initialPages={pages}
        initialPage={page}
        initialSort={sort}
      />
    </>
  );
}

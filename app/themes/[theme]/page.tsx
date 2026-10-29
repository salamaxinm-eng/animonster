import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { CommunityHeader } from '@/components/community/context';
import { AnimeGrid } from '@/components/anime-grid';
import { CatalogPagination } from '@/components/catalog-pagination';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { themeLandings } from '@/lib/server/theme-landings';
import { cachedCatalogPage } from '@/lib/server/library';
import { tagKey, themeUrl } from '@/lib/anime-taxonomy';
import {
  listingSchema,
  listingUrl,
  pageNumber,
  NO_INDEX_FOLLOW,
} from '@/lib/seo';
import { themeIntro } from '@/lib/theme-copy';

export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ theme: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const resolve = cache(async (raw: string, page: number) => {
  let input: string;
  try {
    input = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const theme = (await themeLandings()).find(
    (x) => tagKey(x) === tagKey(input),
  );
  if (!theme) return null;
  if (input !== theme) permanentRedirect(listingUrl(themeUrl(theme), page));
  const catalog = await cachedCatalogPage({
    theme,
    limit: 24,
    offset: (page - 1) * 24,
  });
  if (!catalog.total) return null;
  if (page > Math.ceil(catalog.total / 24)) return null;
  return { theme, catalog };
});

export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const filters = await searchParams;
  const page = pageNumber(filters.page);
  const found = await resolve((await params).theme, page);
  if (!found) return { title: 'Тема не найдена', robots: NO_INDEX_FOLLOW };
  const title =
    `Аниме на тему «${found.theme}»` + (page > 1 ? ` — страница ${page}` : '');
  return {
    title,
    description: title + '. ' + themeIntro(found.theme),
    alternates: { canonical: listingUrl(themeUrl(found.theme), page) },
    robots: Object.keys(filters).some((key) => key !== 'page')
      ? NO_INDEX_FOLLOW
      : undefined,
  };
}

export default async function Page({ params, searchParams }: Props) {
  const page = pageNumber((await searchParams).page);
  const found = await resolve((await params).theme, page);
  if (!found) notFound();
  const { theme, catalog } = found;
  const title =
    `Аниме на тему «${theme}»` + (page > 1 ? ` — страница ${page}` : '');
  return (
    <div className="site-shell">
      <SeoJsonLd
        data={listingSchema(
          title,
          listingUrl(themeUrl(theme), page),
          catalog.items,
          page,
        )}
      />
      <CommunityHeader />
      <main className="title-page">
        <h1>{title}</h1>
        <p>{themeIntro(theme)}</p>
        <p>Тайтлов в каталоге по этой теме: {catalog.total}.</p>
        <AnimeGrid items={catalog.items} />
        <CatalogPagination
          path={themeUrl(theme)}
          page={page}
          pages={Math.ceil(catalog.total / 24)}
        />
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { animeTaxonomy } from '@/lib/server/anime-taxonomy';
import { cachedCatalogPage, genreList } from '@/lib/server/library';
import { tagKey } from '@/lib/anime-taxonomy';
import { CommunityHeader } from '@/components/community/context';
import { GenreCatalog } from '@/components/genre-catalog';
import { SeoJsonLd } from '@/components/seo-json-ld';
import { listingSchema, listingUrl, pageNumber } from '@/lib/seo';
export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ genre: string }>;
  searchParams: Promise<{ page?: string }>;
};
const resolveGenre = cache(async (genre: string) => {
  // Route params may retain percent encoding in the installed Next runtime.
  try {
    genre = decodeURIComponent(genre);
  } catch {
    return null;
  }
  const [{ themes }, genres] = await Promise.all([
    animeTaxonomy(),
    genreList(),
  ]);
  const theme = themes.find((name) => tagKey(name) === tagKey(genre));
  if (theme) redirect('/search?theme=' + encodeURIComponent(theme));
  const match = genres.find((item) => tagKey(item.name) === tagKey(genre));
  if (!match) return null;
  return match.name;
});
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const genre = await resolveGenre((await params).genre),
    page = pageNumber((await searchParams).page);
  if (!genre)
    return {
      title: 'Страница не найдена',
      robots: { index: false, follow: true },
    };
  const title =
    'Аниме жанра «' + genre + '»' + (page > 1 ? ' — страница ' + page : '');
  return {
    title,
    description:
      title +
      ': сериалы и фильмы в каталоге AniMonster. Выбирайте аниме и переходите к просмотру.',
    alternates: {
      canonical: listingUrl('/genres/' + encodeURIComponent(genre), page),
    },
  };
}
export default async function Page({ params, searchParams }: Props) {
  const genre = await resolveGenre((await params).genre),
    page = pageNumber((await searchParams).page);
  if (!genre) notFound();
  const catalog = await cachedCatalogPage({
    genre,
    limit: 24,
    offset: (page - 1) * 24,
  });
  const pages = Math.max(1, Math.ceil(catalog.total / 24));
  if (page > pages) notFound();
  const title =
    'Аниме жанра «' + genre + '»' + (page > 1 ? ' — страница ' + page : '');
  return (
    <div className="site-shell">
      <SeoJsonLd
        data={listingSchema(
          title,
          listingUrl('/genres/' + encodeURIComponent(genre), page),
          catalog.items,
          page,
        )}
      />
      <CommunityHeader />
      <main className="title-page">
        <h1>{title}</h1>
        <GenreCatalog
          genre={genre}
          items={catalog.items}
          page={page}
          pages={pages}
        />
      </main>
    </div>
  );
}

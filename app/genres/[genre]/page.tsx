import type { Metadata } from 'next';
import { cache } from 'react';
import { notFound, permanentRedirect } from 'next/navigation';
import { themeLandings } from '@/lib/server/theme-landings';
import { cachedCatalogPage, genreList } from '@/lib/server/library';
import { tagKey, themeUrl } from '@/lib/anime-taxonomy';
import { CommunityHeader } from '@/components/community/context';
import { GenreCatalog } from '@/components/genre-catalog';
import { SeoJsonLd } from '@/components/seo-json-ld';
import {
  listingSchema,
  listingUrl,
  pageNumber,
  NO_INDEX_FOLLOW,
} from '@/lib/seo';
export const dynamic = 'force-dynamic';
type Props = {
  params: Promise<{ genre: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};
const resolveGenre = cache(async (genre: string, page: number) => {
  // Route params may retain percent encoding in the installed Next runtime.
  try {
    genre = decodeURIComponent(genre);
  } catch {
    return null;
  }
  const [themes, genres] = await Promise.all([themeLandings(), genreList()]);
  const theme = themes.find((name) => tagKey(name) === tagKey(genre));
  if (theme) permanentRedirect(listingUrl(themeUrl(theme), page));
  const match = genres.find((item) => tagKey(item.name) === tagKey(genre));
  if (!match) return null;
  return match.name;
});
export async function generateMetadata({
  params,
  searchParams,
}: Props): Promise<Metadata> {
  const filters = await searchParams;
  const page = pageNumber(filters.page),
    genre = await resolveGenre((await params).genre, page);
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
    robots: Object.keys(filters).some((key) => key !== 'page')
      ? NO_INDEX_FOLLOW
      : undefined,
  };
}
export default async function Page({ params, searchParams }: Props) {
  const page = pageNumber((await searchParams).page),
    genre = await resolveGenre((await params).genre, page);
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

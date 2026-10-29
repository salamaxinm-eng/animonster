import type { Metadata } from 'next';
import { cache } from 'react';
import { headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { titleBlocked } from '@/lib/server/title-restrictions';
import { AnimePage } from '@/components/anime-page';
import { getAnime, getAnimeByAlias } from '@/lib/server/library';
import { posterUrl, type Anime } from '@/lib/anime';
import { db } from '@/lib/server/core';
import { animeTitle } from '@/lib/seo';
import { animeRelations } from '@/lib/server/anime-relations';
import { publicAnimeAvailability } from '@/lib/server/public-anime-availability';
import { CachedAnimeAvailability } from '@/components/cached-anime-availability';

const SITE_URL = 'https://animonster.su';

function plainText(value = '') {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function seoDescription(anime: Anime) {
  const title = anime.russian || anime.name;
  const description = plainText(anime.description || '');
  if (description) return description.slice(0, 190);

  const parts = [
    `Смотреть ${title} онлайн на AniMonster.`,
    anime.aired_on?.slice(0, 4) ? `Год: ${anime.aired_on.slice(0, 4)}.` : '',
    anime.episodes ? `Серий: ${anime.episodes}.` : '',
    anime.genres?.length ? `Жанры: ${anime.genres.join(', ')}.` : '',
  ].filter(Boolean);

  return parts.join(' ').slice(0, 190);
}

const loadAnime = cache(async (slug: string): Promise<Anime | null> => {
  const match = /^(\d{1,9})(?:-[a-z0-9-]+)?$/.exec(slug);
  if (!match && !/^[a-z0-9-]{2,100}$/.test(slug)) return null;
  if (match) {
    const cached = await db()
      .prepare('SELECT data FROM anime_cache WHERE id=?')
      .bind(Number(match[1]))
      .first<{ data: string }>();
    if (cached) {
      const anime = JSON.parse(cached.data) as Anime;
      if (anime.id === Number(match[1]) && (anime.russian || anime.name))
        return anime;
    }
  }
  try {
    const result = match
      ? await getAnime(Number(match[1]))
      : await getAnimeByAlias(slug, true);
    return result?.anime || null;
  } catch (error) {
    if ((error as { status?: number }).status === 404) return null;
    throw error;
  }
});

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id: slug } = await params;
  const anime = await loadAnime(slug);

  if (anime && (await titleBlocked(await headers(), anime))) {
    return {
      title: 'Тайтл заблокирован',
      robots: { index: false, follow: false },
    };
  }

  if (!anime) {
    return {
      title: 'Страница не найдена',
      robots: { index: false, follow: true },
    };
  }

  const name = anime.russian || anime.name;
  const description = seoDescription(anime);
  const image = posterUrl(anime);

  return {
    title: animeTitle(anime),
    description,
    alternates: {
      canonical: `/anime/${anime.id}`,
    },
    keywords: [
      name,
      anime.name,
      `смотреть ${name} онлайн`,
      ...(anime.genres || []),
    ],
    openGraph: {
      type: anime.kind === 'movie' ? 'video.movie' : 'video.tv_show',
      url: `/anime/${anime.id}`,
      title: `${name} — смотреть аниме онлайн`,
      description,
      siteName: 'AniMonster',
      locale: 'ru_RU',
      images: image ? [{ url: image, alt: name }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: `${name} — смотреть аниме онлайн`,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function Page({ params }: PageProps) {
  const { id: slug } = await params;
  const anime = await loadAnime(slug);

  if (anime && (await titleBlocked(await headers(), anime)))
    redirect('/title-blocked');

  if (!anime) notFound();
  const relations = await animeRelations(anime.id).catch(() => undefined);
  const availability = await publicAnimeAvailability(anime, await headers());

  const name = anime.russian || anime.name;
  const description = seoDescription(anime);
  const image = new URL(posterUrl(anime), SITE_URL).toString();
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': anime.kind === 'movie' ? 'Movie' : 'TVSeries',
    name,
    alternateName: anime.name !== name ? anime.name : undefined,
    description,
    image,
    genre: anime.genres,
    datePublished: /^\d{4}-\d{2}-\d{2}$/.test(anime.aired_on || '')
      ? anime.aired_on
      : undefined,
    numberOfEpisodes:
      anime.kind !== 'movie' ? anime.episodes || undefined : undefined,
    url: `${SITE_URL}/anime/${anime.id}`,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Каталог аниме',
                item: SITE_URL + '/catalog',
              },
              {
                '@type': 'ListItem',
                position: 2,
                name,
                item: `${SITE_URL}/anime/${anime.id}`,
              },
            ],
          }).replace(/</g, '\\u003c'),
        }}
      />
      <AnimePage anime={anime} initialRelations={relations}
        cachedAvailability={<CachedAnimeAvailability animeId={anime.id} data={availability} />} />
    </>
  );
}

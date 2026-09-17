import type { Metadata } from 'next';
import { cache } from 'react';
import { AnimePage } from '@/components/anime-page';
import { getAnime, getAnimeByAlias } from '@/lib/server/library';
import { posterUrl, type Anime } from '@/lib/anime';
import ClientAnimePage from './client-page';

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
  try {
    const match = /^(\d{1,9})(?:-[a-z0-9-]+)?$/.exec(slug);
    const result = match
      ? await getAnime(Number(match[1]))
      : await getAnimeByAlias(slug);
    return result?.anime || null;
  } catch {
    return null;
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

  if (!anime) {
    return {
      title: 'Аниме онлайн',
      description: 'Смотреть аниме онлайн на AniMonster.',
      robots: { index: false, follow: true },
    };
  }

  const name = anime.russian || anime.name;
  const description = seoDescription(anime);
  const image = posterUrl(anime);

  return {
    title: `${name} — смотреть аниме онлайн`,
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

  if (!anime) return <ClientAnimePage />;

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
    datePublished: anime.aired_on || undefined,
    numberOfEpisodes: anime.episodes || undefined,
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
      <AnimePage anime={anime} />
    </>
  );
}

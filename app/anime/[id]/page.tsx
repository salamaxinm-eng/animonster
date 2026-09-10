import { notFound } from 'next/navigation';
import { getAnime, getAnimeByAlias } from '@/lib/server/library';
import { AnimePage } from '@/components/anime-page';
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: slug } = await params,
    match = /^(\d{1,9})(?:-[a-z0-9-]+)?$/.exec(slug);
  const data = match
    ? await getAnime(Number(match[1]))
    : await getAnimeByAlias(slug);
  if (!data) notFound();
  return <AnimePage anime={data.anime} />;
}

'use client';

import { useEffect, useState } from 'react';
import { Art } from './shared';

export function ContinueWatchingArt({
  animeId,
  poster,
}: {
  animeId: number;
  poster: string | null;
}) {
  const [screenshot, setScreenshot] = useState<{
    animeId: number;
    image: string;
  } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/anime-screenshot?anime_id=${animeId}`, {
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted && typeof data?.image === 'string') {
          setScreenshot({ animeId, image: data.image });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [animeId]);
  const image = screenshot?.animeId === animeId ? screenshot.image : null;
  return <Art src={image || poster} fallbackSrc={poster} />;
}

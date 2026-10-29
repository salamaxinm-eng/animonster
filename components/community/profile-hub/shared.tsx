'use client';
import { FeedbackMessage } from '@/components/feedback-message';

import { useEffect, useRef, useState } from 'react';
import { ImageOff, Search } from 'lucide-react';
import { proxyImageUrl } from '@/lib/anime';
import type { Anime } from '@/lib/anime';
import type { Entry, Profile, CollectionList } from '@/lib/community';

export type HubProfile = {
  user: Profile;
  own: boolean;
  passport_public: boolean;
  lists: CollectionList[];
  anime_showcase: Array<{ anime_id: number; anime: Anime | null }>;
  character_showcase: Array<{ id: string; name: string; image: string }>;
  characters: Array<{ id: string; name: string; image: string }>;
};
export type HistoryItem = {
  anime_id: number;
  episode: number;
  position: number;
  duration: number;
  updated_at: number;
  completed: number;
  title: string;
  image: string | null;
  total_episodes: number | null;
  completed_episodes?: number;
};
export type ListItem = Entry & {
  latest: HistoryItem | null;
  total_episodes: number | null;
  completed_episodes: number;
};
export type Cosmetic = {
  id: string;
  kind: 'tag' | 'pin' | 'frame' | 'theme' | 'background';
  slug: string;
  name: string;
  description: string;
  rarity: string;
  image: string | null;
  condition: string;
  unlocked: boolean;
  unlocked_at: number | null;
  source: string;
};
export type Achievement = {
  id: string;
  name: string;
  description: string;
  threshold: number;
  progress: number;
  completed: boolean;
  unlocked_at: number | null;
  rewards: Array<{
    image: string | null;
    name: string;
    kind: string;
    slug: string;
  }>;
};
export type ActivityItem = {
  id: string;
  kind: 'watch' | 'achievement' | 'cosmetic';
  title: string;
  date: number;
  anime_id: number | null;
  episode: number | null;
};
export type Payment = {
  id: string;
  plan: string | null;
  amount: string | null;
  status: string;
  created_at: number;
};
export type PageData<T> = { items: T[]; hasMore: boolean };

export function sectionHref(section: string) {
  return section === 'overview' ? '/profile' : `/profile?section=${section}`;
}
export function dateLabel(time: number) {
  return new Date(Number(time)).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
export function timeLabel(time: number) {
  return new Date(Number(time)).toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
export function durationLabel(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export function percentage(value: number, total: number) {
  return total > 0
    ? Math.min(100, Math.max(0, Math.round((value / total) * 100)))
    : 0;
}
export function backgroundUrl(value: string | null) {
  return value?.startsWith('asset:')
    ? `/api/plus-assets/${value.split(':')[1]}`
    : value || '/hero.webp';
}
export function groupByDate<T>(items: T[], getTime: (item: T) => number) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const label = dateLabel(getTime(item));
    const group = groups.get(label) || [];
    group.push(item);
    groups.set(label, group);
  }
  return Array.from(groups.entries());
}
export function equipped(item: Cosmetic, user: Profile) {
  if (item.kind === 'background')
    return (
      user.profile_background === item.image ||
      user.profile_background === item.slug
    );
  if (item.kind === 'frame') return user.profile_frame === item.slug;
  if (item.kind === 'theme')
    return user.theme === (item.slug === 'bleach-theme' ? 'v2-bleach' : item.slug);
  return user[item.kind] === item.slug;
}
export const rarityLabels: Record<string, string> = {
  common: 'Обычная',
  rare: 'Редкая',
  epic: 'Эпическая',
  legendary: 'Легендарная',
};

export async function readJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || 'Не удалось загрузить данные');
  return result;
}
export function useResource<T>(url: string | null, revision = 0) {
  const previousUrl = useRef(url);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!!url);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (previousUrl.current !== url) {
      setData(null);
      previousUrl.current = url;
    }
    if (!url) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void readJson<T>(url, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setData(value);
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [url, revision, retry]);
  return { data, loading, error, retry: () => setRetry((value) => value + 1) };
}
export function usePagedResource<T>(url: string, revision = 0) {
  const currentUrl = useRef(url);
  currentUrl.current = url;
  const resource = useResource<PageData<T>>(url, revision);
  const [extra, setExtra] = useState<T[]>([]);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setExtra([]);
    setPage(0);
    setMore(!!resource.data?.hasMore);
    setError('');
  }, [resource.data]);
  async function loadMore() {
    if (pending || resource.loading) return;
    setPending(true);
    setError('');
    try {
      const next = page + 1;
      const result = await readJson<PageData<T>>(`${url}&page=${next}`);
      if (currentUrl.current !== url) return;
      setExtra((old) => [...old, ...result.items]);
      setPage(next);
      setMore(result.hasMore);
    } catch (cause) {
      if (currentUrl.current === url) setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return {
    ...resource,
    items: [...(resource.data?.items || []), ...extra],
    hasMore: !resource.loading && more,
    pending: pending || resource.loading,
    moreError: error,
    loadMore,
  };
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="hub-empty">{children}</div>;
}
export function ResourceState({
  loading,
  error,
  retry,
}: {
  loading: boolean;
  error: string;
  retry: () => void;
}) {
  if (loading)
    return (
      <p className="hub-state" role="status">
        Загружаем данные…
      </p>
    );
  if (error)
    return (
      <div className="hub-error" role="alert">
        <p><FeedbackMessage>{error}</FeedbackMessage></p>
        <button className="hub-button" onClick={retry}>
          Повторить
        </button>
      </div>
    );
  return null;
}
export function More({
  hasMore,
  pending,
  moreError,
  loadMore,
}: {
  hasMore: boolean;
  pending: boolean;
  moreError: string;
  loadMore: () => Promise<void>;
}) {
  return (
    <>
      {moreError && (
        <p className="hub-error" role="alert">
          <FeedbackMessage>{moreError}</FeedbackMessage>
        </p>
      )}
      {hasMore && (
        <button
          className="hub-button hub-more"
          disabled={pending}
          onClick={() => void loadMore()}
        >
          {pending ? 'Загружаем…' : 'Показать ещё'}
        </button>
      )}
    </>
  );
}
export function Progress({
  value,
  total,
  label,
}: {
  value: number;
  total: number;
  label: string;
}) {
  return (
    <div
      className="hub-progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={percentage(value, total)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <span style={{ width: `${percentage(value, total)}%` }} />
    </div>
  );
}
export function Art({
  src,
  fallbackSrc,
  alt = '',
  className,
}: {
  src?: string | null;
  fallbackSrc?: string | null;
  alt?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if ((!src || failed) && fallbackSrc && fallbackSrc !== src) {
    return <Art src={fallbackSrc} alt={alt} className={className} />;
  }
  if (!src || failed)
    return (
      <span
        className={`hub-art-fallback ${className || ''}`}
        role={alt ? 'img' : undefined}
        aria-label={alt || undefined}
      >
        <ImageOff aria-hidden="true" />
      </span>
    );
  return (
    <img
      className={className}
      src={
        src.startsWith('/') || src.startsWith('blob:')
          ? src
          : proxyImageUrl(src)
      }
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
export function SearchField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <label className="hub-search">
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
      />
    </label>
  );
}
export function FilterTabs({
  options,
  value,
  onChange,
  label,
}: {
  options: Array<[string, string]>;
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="hub-tabs" role="group" aria-label={label}>
      {options.map(([id, text]) => (
        <button
          type="button"
          key={id}
          className={id === value ? 'active' : ''}
          aria-pressed={id === value}
          onClick={() => onChange(id)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

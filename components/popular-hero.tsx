'use client';
import { useEffect, useState } from 'react';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from '@/components/ui/carousel';
import { Play, Pause, ChevronLeft, ChevronRight } from 'lucide-react';
import { posterUrl, type Anime } from '@/lib/anime';
export function PopularHero({
  initial,
  onOpen,
}: {
  initial: Anime[];
  onOpen: (a: Anime) => void;
}) {
  const [items, setItems] = useState(initial.slice(0, 5)),
    [api, setApi] = useState<CarouselApi>(),
    [index, setIndex] = useState(0),
    [paused, setPaused] = useState(false),
    [hover, setHover] = useState(false),
    [focus, setFocus] = useState(false),
    [label, setLabel] = useState('Популярное в каталоге');
  useEffect(() => {
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    setPaused(m.matches);
    fetch('/api/popular')
      .then((r) => r.json())
      .then((x: any) => {
        if (x.items?.length) {
          setItems(x.items);
          setLabel(x.source);
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (!api) return;
    const select = () => setIndex(api.selectedScrollSnap());
    api.on('select', select);
    return () => {
      api.off('select', select);
    };
  }, [api]);
  useEffect(() => {
    if (!api || paused || hover || focus) return;
    const t = setInterval(() => {
      if (!document.hidden) api.scrollNext();
    }, 4000);
    return () => clearInterval(t);
  }, [api, paused, hover, focus]);
  return (
    <Carousel
      className="popular-hero"
      opts={{ loop: true }}
      setApi={setApi}
      aria-label="Популярные аниме"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocusCapture={() => setFocus(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocus(false);
      }}
    >
      <CarouselContent>
        {items.map((a, i) => (
          <CarouselItem key={a.id}>
            <section className="hero anime-hero" aria-hidden={i !== index}>
              <img className="hero-backdrop" src={posterUrl(a)} alt="" />
              <img
                className="hero-feature-poster"
                src={posterUrl(a)}
                alt={a.russian}
              />
              <div className="hero-shade" />
              <div className="hero-copy">
                <div className="eyebrow">
                  <span /> {label.toUpperCase()} · ТОП {i + 1}
                </div>
                <h1>{a.russian}</h1>
                <div className="anime-meta">
                  <strong>★ {a.score}</strong>
                  <span>{a.aired_on.slice(0, 4)}</span>
                  <span>{a.episodes} серий</span>
                  <span>{a.genres?.slice(0, 2).join(' · ')}</span>
                </div>
                <p className="hero-description">
                  {a.description?.replace(/<[^>]*>/g, '').slice(0, 220)}
                </p>
                <button
                  tabIndex={i === index ? 0 : -1}
                  className="primary"
                  onClick={() => onOpen(a)}
                >
                  <Play size={18} fill="currentColor" /> Смотреть аниме
                </button>
              </div>
            </section>
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="hero-controls">
        <div className="hero-dots">
          {items.map((a, i) => (
            <button
              key={a.id}
              aria-label={'Показать ' + a.russian}
              aria-current={index === i ? 'true' : undefined}
              className={index === i ? 'active' : ''}
              onClick={() => api?.scrollTo(i)}
            />
          ))}
        </div>
        <span>
          {String(index + 1).padStart(2, '0')} /{' '}
          {String(items.length).padStart(2, '0')}
        </span>
        <button
          aria-label={
            paused ? 'Включить автопрокрутку' : 'Приостановить автопрокрутку'
          }
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </button>
        <button aria-label="Предыдущее аниме" onClick={() => api?.scrollPrev()}>
          <ChevronLeft size={20} />
        </button>
        <button aria-label="Следующее аниме" onClick={() => api?.scrollNext()}>
          <ChevronRight size={20} />
        </button>
      </div>
    </Carousel>
  );
}

'use client';
import { useEffect, useRef, type RefObject } from 'react';
import { seasonPoint } from '@/lib/demo-season';
import type { DemoCatalog } from '@/lib/player-demo';

export function useDemoAnalytics(
  video: RefObject<HTMLVideoElement | null>,
  catalog: DemoCatalog,
  loaded: boolean,
  userId: string | undefined,
  continuous: boolean,
  episode: number,
  voice: string,
) {
  const config = useRef({ catalog, continuous, episode });
  config.current = { catalog, continuous, episode };
  useEffect(() => {
    if (!loaded || !catalog.malId || !voice) return;
    let token = '',
      cancelled = false,
      sending = false,
      seconds = 0,
      position = 0;
    let previous: {
      wall: number;
      position: number;
      playing: boolean;
      rate: number;
    } | null = null;
    const element = video.current;
    if (!element) return;
    const sample = () => {
      const current = {
        wall: performance.now(),
        position: element.currentTime,
        playing: !element.paused && !element.seeking && element.readyState >= 3,
        rate: element.playbackRate,
      };
      const point =
        config.current.continuous && config.current.catalog.season
          ? seasonPoint(config.current.catalog.season, current.position)
          : { episode: config.current.episode, position: current.position };
      if (point.episode === episode) position = point.position;
      if (
        token &&
        previous &&
        previous.playing &&
        current.playing &&
        point.episode === episode
      ) {
        const wall = (current.wall - previous.wall) / 1000,
          media = current.position - previous.position;
        if (
          wall > 0 &&
          wall < 5 &&
          media > 0 &&
          media <= wall * Math.max(previous.rate, current.rate) + 0.5
        )
          seconds += Math.min(wall, media / current.rate);
      }
      previous = current;
    };
    const flush = () => {
      if (!token || sending || seconds < 1) return;
      const amount = Math.min(30, Math.floor(seconds));
      seconds -= amount;
      sending = true;
      void fetch('/api/watch', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, seconds: amount, position }),
      })
        .then((response) => {
          if (response.status === 409 && !cancelled) token = '';
        })
        .catch(() => {})
        .finally(() => {
          sending = false;
        });
    };
    const start = async () => {
      try {
        const response = await fetch('/api/watch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            anime_id: catalog.malId,
            episode,
            provider: 'demo',
            voiceover: voice,
          }),
        });
        if (!response.ok) return;
        const value = await response.json();
        if (!cancelled) {
          token = value.token || '';
          previous = null;
        }
      } catch {}
    };
    void start();
    let ticks = 0;
    const timer = setInterval(() => {
      sample();
      if (++ticks % 15 === 0) {
        if (!token) void start();
        else flush();
      }
    }, 1000);
    const reset = () => {
      previous = null;
    };
    const pause = () => {
      flush();
      reset();
    };
    element.addEventListener('seeking', reset);
    element.addEventListener('pause', pause);
    element.addEventListener('ended', pause);
    window.addEventListener('pagehide', flush);
    return () => {
      cancelled = true;
      clearInterval(timer);
      flush();
      element.removeEventListener('seeking', reset);
      element.removeEventListener('pause', pause);
      element.removeEventListener('ended', pause);
      window.removeEventListener('pagehide', flush);
    };
  }, [video, catalog.malId, loaded, userId, continuous, episode, voice]);
}

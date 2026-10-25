'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DemoCatalog } from '@/lib/player-demo';
import {
  addPlaybackRange,
  feedbackEligible,
  mergeCoverage,
  playedInterval,
  FEEDBACK_SNOOZE,
  type DemoCoverage,
  type DemoFeedbackState,
  type WatchSample,
} from '@/lib/demo-feedback';

type LocalState = {
  watched: DemoCoverage;
  submitted: boolean;
  dismissedUntil: number;
};
const empty = (): LocalState => ({
  watched: {},
  submitted: false,
  dismissedUntil: 0,
});
export function useDemoFeedback(
  catalog: DemoCatalog,
  userId: string | undefined,
  loaded: boolean,
  continuous: boolean,
  episode: number,
) {
  const key = `animonster-demo-feedback-v1:${userId || 'guest'}`;
  const [state, setState] = useState<DemoFeedbackState | null>(null);
  const config = useRef({ catalog, continuous, episode });
  config.current = { catalog, continuous, episode };
  const local = useRef<LocalState>(empty()),
    identity = useRef(key),
    remote = useRef<DemoFeedbackState | null>(null);
  const previous = useRef<WatchSample | null>(null),
    busy = useRef(false),
    dirty = useRef(false);
  const save = useCallback(() => {
    try {
      localStorage.setItem(identity.current, JSON.stringify(local.current));
    } catch {}
  }, []);
  const accept = useCallback(
    (next: DemoFeedbackState, owner: string) => {
      if (identity.current !== owner) return;
      local.current = {
        watched: mergeCoverage(
          local.current.watched,
          next.watched,
          config.current.catalog.episodes,
        ),
        submitted: local.current.submitted || next.submitted,
        dismissedUntil: Math.max(
          local.current.dismissedUntil,
          next.dismissedUntil,
        ),
      };
      remote.current = { ...next, ...local.current };
      setState(remote.current);
      save();
    },
    [save],
  );
  const post = useCallback(
    async (input: Record<string, unknown>, keepalive = false) => {
      const owner = identity.current,
        scope = remote.current?.scope;
      if (!scope)
        throw new Error('Подключитесь к интернету и попробуйте ещё раз.');
      const response = await fetch('/api/player-demo/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, scope }),
        keepalive,
      });
      const value = await response.json();
      if (!response.ok)
        throw new Error(value.error || 'Не удалось сохранить отзыв');
      accept(value, owner);
      return value as DemoFeedbackState;
    },
    [accept],
  );
  const flush = useCallback(
    async (keepalive = false) => {
      save();
      if (remote.current?.eligible || local.current.submitted) {
        dirty.current = false;
        return;
      }
      if (busy.current || !dirty.current || !remote.current) return;
      const owner = identity.current;
      busy.current = true;
      dirty.current = false;
      try {
        await post(
          { action: 'watch', watched: local.current.watched },
          keepalive,
        );
      } catch {
        if (identity.current === owner) dirty.current = true;
      } finally {
        if (identity.current === owner) busy.current = false;
      }
    },
    [post, save],
  );
  useEffect(() => {
    if (!loaded) return;
    identity.current = key;
    local.current = empty();
    remote.current = null;
    previous.current = null;
    busy.current = false;
    dirty.current = false;
    setState(null);
    try {
      const data = JSON.parse(localStorage.getItem(key) || 'null');
      if (data)
        local.current = {
          watched: mergeCoverage(
            {},
            data.watched,
            config.current.catalog.episodes,
          ),
          submitted: data.submitted === true,
          dismissedUntil: Number.isFinite(data.dismissedUntil)
            ? data.dismissedUntil
            : 0,
        };
    } catch {}
    let cancelled = false;
    const controller = new AbortController();
    const hydrate = async () => {
      try {
        const response = await fetch('/api/player-demo/feedback', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) return;
        const value = await response.json();
        if (cancelled) return;
        accept(value, key);
        dirty.current = Object.keys(local.current.watched).length > 0;
        await flush();
      } catch {}
    };
    void hydrate();
    const timer = setInterval(
      () => void (remote.current ? flush() : hydrate()),
      30000,
    );
    const hidden = () => {
      if (document.visibilityState === 'hidden') void flush(true);
    };
    const leaving = () => void flush(true);
    window.addEventListener('pagehide', leaving);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
      save();
      window.removeEventListener('pagehide', leaving);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [key, loaded, accept, flush, save]);
  const reset = useCallback(() => {
    previous.current = null;
  }, []);
  const sample = useCallback(
    (element: HTMLVideoElement) => {
      if (!loaded || identity.current !== key) return;
      if (remote.current?.eligible || local.current.submitted) {
        previous.current = null;
        return;
      }
      const current = {
        position: element.currentTime,
        wall: performance.now(),
        playing:
          !element.paused &&
          !element.ended &&
          !element.seeking &&
          element.readyState >= 2,
        rate: element.playbackRate,
      };
      const interval = playedInterval(previous.current, current);
      previous.current = current;
      if (!interval) return;
      const c = config.current;
      try {
        local.current.watched = addPlaybackRange(
          local.current.watched,
          interval,
          c.catalog.episodes,
          c.continuous ? c.catalog.season?.chapters : undefined,
          c.episode,
        );
      } catch {
        return;
      }
      dirty.current = true;
      if (
        !remote.current?.eligible &&
        feedbackEligible(local.current.watched, c.catalog.episodes)
      )
        void flush();
    },
    [key, loaded, flush],
  );
  const submit = useCallback(
    async (score: number, comment: string) => {
      await flush();
      return post({ action: 'submit', score, comment });
    },
    [flush, post],
  );
  const dismiss = useCallback(() => {
    local.current.dismissedUntil = Date.now() + FEEDBACK_SNOOZE;
    save();
    if (remote.current) {
      remote.current = {
        ...remote.current,
        dismissedUntil: local.current.dismissedUntil,
      };
      setState(remote.current);
    }
    void post({ action: 'dismiss' }).catch(() => {});
  }, [post, save]);
  return {
    sample,
    reset,
    submit,
    dismiss,
    eligible:
      identity.current === key &&
      !!state?.eligible &&
      !state.submitted &&
      state.dismissedUntil <= Date.now(),
  };
}

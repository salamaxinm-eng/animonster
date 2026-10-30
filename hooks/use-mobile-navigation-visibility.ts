'use client';

import { useEffect, useState, type RefObject } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  navigationScrollStart,
  navigationScrollStep,
  type NavigationScrollState,
} from '@/lib/mobile-navigation-scroll';

const overlays = [
  'dialog[open]',
  '[role="dialog"][aria-modal="true"]',
  '[role="alertdialog"]',
  '[data-slot="dialog-overlay"]',
  '[data-slot="alert-dialog-overlay"]',
  '[data-slot="drawer-overlay"]',
  '.demo-faux-fullscreen',
  '.search-filter-panel',
  '.hub-menu-backdrop',
  '.party-sidebar.open',
].join(',');

function editingText() {
  const element = document.activeElement;
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  if (element instanceof HTMLTextAreaElement)
    return !element.readOnly && !element.disabled;
  return (
    element instanceof HTMLInputElement &&
    !element.readOnly &&
    !element.disabled &&
    !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(
      element.type,
    )
  );
}

export function useMobileNavigationVisibility(
  route: string,
  nav: RefObject<HTMLElement | null>,
) {
  const mobile = useIsMobile();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    setHidden(false);
    if (!mobile || !nav.current) return;
    const page = document.scrollingElement || document.documentElement;
    let sources = new WeakMap<Element, NavigationScrollState>();
    sources.set(page, navigationScrollStart(window.scrollY));
    let source: Element = page;
    let pendingScroll = false;
    let frame = 0;
    let nativeFullscreen = false;
    let blocked = false;
    let renderedHidden = false;

    const render = (value: boolean) => {
      if (value !== renderedHidden) {
        renderedHidden = value;
        setHidden(value);
      }
    };
    const maximum = (element: Element) =>
      element.scrollHeight -
      (element === page ? window.innerHeight : element.clientHeight);
    const position = (element: Element) =>
      element === page ? window.scrollY : element.scrollTop;
    const reset = () => {
      sources = new WeakMap();
      source = page;
      sources.set(page, navigationScrollStart(position(page)));
      pendingScroll = false;
      schedule();
    };
    const update = () => {
      frame = 0;
      if (source !== page && !source.isConnected) {
        source = page;
        pendingScroll = false;
      }
      const isBlocked =
        nativeFullscreen ||
        !!document.fullscreenElement ||
        !!(document as Document & { webkitFullscreenElement?: Element })
          .webkitFullscreenElement ||
        editingText() ||
        [...document.querySelectorAll<HTMLElement>(overlays)].some(
          (element) =>
            !element.hidden &&
            !element.hasAttribute('data-closed') &&
            element.getAttribute('aria-hidden') !== 'true' &&
            element.getClientRects().length > 0,
        );
      const previous =
        sources.get(source) || navigationScrollStart(position(source));
      if (isBlocked || blocked !== isBlocked) {
        sources.set(source, {
          ...previous,
          position: position(source),
          distance: 0,
          direction: 0,
        });
      } else if (pendingScroll) {
        const next = navigationScrollStep(
          previous,
          position(source),
          maximum(source),
        );
        // Keep an open profile dropdown/keyboard focus anchored to its trigger.
        const active = document.activeElement;
        if (
          nav.current?.querySelector(
            '[aria-expanded="true"], [data-popup-open]',
          ) ||
          (active instanceof HTMLElement &&
            active.matches(':focus-visible') &&
            nav.current?.contains(active))
        )
          next.hidden = false;
        sources.set(source, next);
      } else if (maximum(source) <= 10 || position(source) <= 8) {
        sources.set(source, navigationScrollStart(position(source)));
      }
      blocked = isBlocked;
      pendingScroll = false;
      render(blocked || !!sources.get(source)?.hidden);
    };
    function schedule() {
      if (!frame) frame = requestAnimationFrame(update);
    }
    const scroll = (event: Event) => {
      const target = event.target;
      const candidate =
        target === document || target === window ? page : target;
      if (!(candidate instanceof Element)) return;
      if (
        candidate !== page &&
        (maximum(candidate) <= 10 ||
          candidate.closest(
            'nav, textarea, [contenteditable], [role="menu"], [data-slot="dropdown-menu-content"]',
          ) ||
          !/auto|scroll/.test(getComputedStyle(candidate).overflowY))
      )
        return;
      if (!sources.has(candidate))
        sources.set(candidate, navigationScrollStart());
      source = candidate;
      pendingScroll = true;
      schedule();
    };
    const begin = () => {
      nativeFullscreen = true;
      schedule();
    };
    const end = () => {
      nativeFullscreen = false;
      schedule();
    };
    const observer = new MutationObserver((records) => {
      if (
        records.some(
          (record) =>
            record.type === 'childList' ||
            record.attributeName !== 'class' ||
            (record.target instanceof Element &&
              record.target.matches(overlays)) ||
            /demo-faux-fullscreen|party-sidebar/.test(record.oldValue || ''),
        )
      )
        schedule();
    });
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeOldValue: true,
      attributeFilter: [
        'class',
        'open',
        'aria-modal',
        'data-open',
        'data-closed',
        'hidden',
      ],
    });
    const resize = new ResizeObserver(() => schedule());
    resize.observe(page);
    window.addEventListener('scroll', scroll, { capture: true, passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    window.addEventListener('pageshow', reset);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('fullscreenchange', schedule);
    document.addEventListener('webkitfullscreenchange', schedule);
    document.addEventListener('webkitbeginfullscreen', begin, true);
    document.addEventListener('webkitendfullscreen', end, true);
    window.visualViewport?.addEventListener('resize', schedule, {
      passive: true,
    });
    schedule();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      resize.disconnect();
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pageshow', reset);
      document.removeEventListener('focusin', schedule);
      document.removeEventListener('focusout', schedule);
      document.removeEventListener('fullscreenchange', schedule);
      document.removeEventListener('webkitfullscreenchange', schedule);
      document.removeEventListener('webkitbeginfullscreen', begin, true);
      document.removeEventListener('webkitendfullscreen', end, true);
      window.visualViewport?.removeEventListener('resize', schedule);
    };
  }, [mobile, route, nav]);
  return hidden;
}

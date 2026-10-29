'use client';

import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { analyticsLocation } from '@/lib/seo-policy';

const METRIKA_ID = 112871840;

declare global {
  interface Window {
    ym?: (...args: any[]) => void;
  }
}

export default function YandexMetrika() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ready, setReady] = useState(false);

  const lastUrl = useRef('');
  const previousUrl = useRef('');
  const initialized = useRef(false);
  const sensitive =
    analyticsLocation(
      pathname + (searchParams.size ? '?' + searchParams.toString() : ''),
    ) === null;

  const sendHit = useCallback(() => {
    if (!window.ym) return;
    const url = analyticsLocation(window.location.href);
    if (url === null) return;

    // Чтобы случайно не отправить один просмотр дважды
    if (lastUrl.current === url) return;

    window.ym(METRIKA_ID, 'hit', url, {
      title: document.title,
      referer:
        previousUrl.current || analyticsLocation(document.referrer) || '',
    });

    previousUrl.current = url;
    lastUrl.current = url;
  }, []);

  useEffect(() => {
    if (sensitive) {
      if (initialized.current && window.ym) window.ym(METRIKA_ID, 'destruct');
      initialized.current = false;
      previousUrl.current = '';
      return;
    }
    if (!ready || !window.ym) return;
    if (!initialized.current) {
      window.ym(METRIKA_ID, 'init', {
        defer: true,
        ssr: true,
        webvisor: false,
        clickmap: true,
        ecommerce: 'dataLayer',
        accurateTrackBounce: true,
        trackLinks: false,
        url: analyticsLocation(window.location.href),
        referrer: analyticsLocation(document.referrer) || '',
      });
      initialized.current = true;
      lastUrl.current = '';
    }
    sendHit();
  }, [ready, pathname, searchParams, sensitive, sendHit]);

  if (sensitive) return null;

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
      >
        {`
          (function(m,e,t,r,i,k,a){
              m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
              m[i].l=1*new Date();
              for (var j=0;j<document.scripts.length;j++){
                  if(document.scripts[j].src===r){return;}
              }
              k=e.createElement(t),
              a=e.getElementsByTagName(t)[0],
              k.async=1,
              k.src=r,
              a.parentNode.insertBefore(k,a)
          })(
              window,
              document,
              'script',
              'https://mc.yandex.ru/metrika/tag.js?id=${METRIKA_ID}',
              'ym'
          );

        `}
      </Script>

      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{
              position: 'absolute',
              left: '-9999px',
            }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
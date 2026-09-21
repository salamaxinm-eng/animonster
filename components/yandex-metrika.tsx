"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

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

  const lastUrl = useRef("");
  const previousUrl = useRef("");

  const sendHit = useCallback(() => {
    if (!window.ym) return;

    const url =
      window.location.pathname +
      window.location.search +
      window.location.hash;

    // Чтобы случайно не отправить один просмотр дважды
    if (lastUrl.current === url) return;

    window.ym(METRIKA_ID, "hit", url, {
      title: document.title,
      referer: previousUrl.current || document.referrer,
    });

    previousUrl.current = window.location.href;
    lastUrl.current = url;
  }, []);

  useEffect(() => {
    if (!ready) return;

    sendHit();
  }, [ready, pathname, searchParams, sendHit]);

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

          ym(${METRIKA_ID}, 'init', {
              defer: true,
              ssr: true,
              webvisor: true,
              clickmap: true,
              ecommerce: "dataLayer",
              accurateTrackBounce: true,
              trackLinks: true
          });
        `}
      </Script>

      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${METRIKA_ID}`}
            style={{
              position: "absolute",
              left: "-9999px",
            }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
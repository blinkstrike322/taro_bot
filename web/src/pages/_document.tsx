import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

// Google Fonts разворачиваем из render-blocking в async: ожидающий stylesheet
// в <head> блокирует исполнение всех последующих defer-скриптов и первый
// рендер в WebKit — при медленном/недоступном fonts.googleapis.com мини-апп
// висит чёрным экраном. media="print" не блокирует, инлайн-скрипт вернёт
// media=all по load (с таймер-фолбэком, если событие уже проскочило из кэша).
const GF_FLIP =
  "(function(){var l=document.getElementById('gf-css');if(!l)return;var on=function(){l.media='all'};l.addEventListener('load',on);setTimeout(on,3000)})()";

export default function Document() {
  return (
    <Html lang="ru" className="bg-black">
      <Head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <meta name="theme-color" content="#000000" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          id="gf-css"
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,600;0,700;0,800;1,400;1,500&display=swap"
          media="print"
        />
        <script dangerouslySetInnerHTML={{ __html: GF_FLIP }} />
      </Head>
      <body className="font-mono text-white flex flex-col">
        <Main />
        <NextScript />
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </body>
    </Html>
  );
}

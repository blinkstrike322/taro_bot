import { Html, Head, Main, NextScript } from 'next/document';
import Script from 'next/script';

export default function Document() {
  return (
    <Html lang="ru" style={{ background: '#F2F0F4' }}>
      <Head>
        <meta name="theme-color" content="#F2F0F4" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500;1,600&family=Manrope:wght@400;500;600;700;800&family=Pixelify+Sans:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body style={{ background: '#F2F0F4', color: '#373A4D' }}>
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

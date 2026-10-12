import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Cormorant_Garamond, Manrope } from 'next/font/google';
import TelegramInit from '@/components/TelegramInit';
import './globals.css';
import './premium.css';

const serif = Cormorant_Garamond({
  variable: '--font-serif', subsets: ['latin', 'cyrillic'],
  weight: ['500', '600'], display: 'swap',
});
const sans = Manrope({
  variable: '--font-premium-sans', subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600'], display: 'swap',
});

export const metadata: Metadata = {
  title: 'ARCANUM — личный ритуал',
  description: 'Тихое пространство для важного вопроса. Восемь раскладов, три проводника, персональное чтение и журнал твоих открытий.',
  icons: { icon: '/guides/shadow_walker.png' },
};
export const viewport: Viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0d100d',
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Telegram's SDK writes viewport CSS variables before React hydrates this element.
  return <html lang="ru" suppressHydrationWarning><body className={`${sans.variable} ${serif.variable}`}>
    <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
    <TelegramInit />
    {children}
  </body></html>;
}

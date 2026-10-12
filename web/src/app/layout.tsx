import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
import TelegramInit from "@/components/TelegramInit";
import { GUIDES } from "@/lib/guides";
import "./globals.css";

const mono = JetBrains_Mono({
  variable: "--font-mono-crt",
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "700"],
  display: "swap",
});

const serif = Cormorant_Garamond({
  variable: "--font-serif",
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ARCANUM — оккультный терминал",
  description:
    "Таро-терминал: один непрерывный транскрипт, три проводника, восемь раскладов. Карты дня, вопросы, тень, пентаграмма и подкова.",
  icons: { icon: "/guides/shadow_walker.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#04040e",
};

// Инлайн-скрипт ДО первой краски: покрытие фосфора (taro_theme →
// data-splash-theme) и палитра проводника (taro_character → CSS-вары
// --guide-accent/-dim/-glow, --t-bg, --glow-center) на <html>.
// Заставка включается в своих цветах с первого кадра, без FOUC-окна
// SSR→гидрация. Палитра вшита из GUIDES при сборке — один источник
// истины; React <html> не трогает (suppressHydrationWarning).
const GUIDE_BOOT_PALETTE = JSON.stringify(
  Object.fromEntries(
    Object.values(GUIDES).map((g) => [
      g.id,
      [g.accent, g.accentDim, g.accentGlow, g.bgDeep, g.glowCenter],
    ]),
  ),
);
const PHOSPHOR_BOOT = `(function(){try{var t=localStorage.getItem('taro_theme');if(t==='silver'||t==='ember'||t==='ash')document.documentElement.setAttribute('data-splash-theme',t);var P=${GUIDE_BOOT_PALETTE};var g=localStorage.getItem('taro_character');if(g&&P[g]){var s=document.documentElement.style,v=P[g];s.setProperty('--guide-accent',v[0]);s.setProperty('--guide-accent-dim',v[1]);s.setProperty('--guide-glow',v[2]);s.setProperty('--t-bg',v[3]);s.setProperty('--glow-center',v[4])}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${mono.variable} ${serif.variable} antialiased`}>
        <script dangerouslySetInnerHTML={{ __html: PHOSPHOR_BOOT }} />
        {/* Официальный SDK Mini App: без него клиент не предоставляет
            window.Telegram.WebApp → initData пуст → API отвечает E1. */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <TelegramInit />
        {children}
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Cormorant_Garamond } from "next/font/google";
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
  themeColor: "#05040f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${mono.variable} ${serif.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

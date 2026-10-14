import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./premium.css";
import "./home.css";

export const metadata: Metadata = {
  title: "ARCANUM — личный ритуал",
  description:
    "Тихое пространство для важного вопроса. Восемь раскладов, три проводника, персональное чтение и журнал твоих открытий.",
  icons: { icon: "/guides/shadow_walker.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#050505",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Telegram's SDK writes viewport CSS variables before React hydrates this element.
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className="arcanum-body">
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  );
}

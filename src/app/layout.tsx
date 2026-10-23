import type { Metadata, Viewport } from "next";
import { Toaster } from "sonner";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Hausjo Agent Network", template: "%s · Hausjo Agent Network" },
  description: "Jaringan agen EDC PT Hausjo Digital Pro — rekrut merchant, jual perangkat EDC, dan kelola komisi secara transparan.",
  icons: { icon: "/favicon.svg" },
};

export const viewport: Viewport = { themeColor: "#10265a", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" />
      </head>
      <body className="min-h-screen font-sans">
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}

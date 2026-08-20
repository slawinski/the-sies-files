import type { Metadata, Viewport } from "next";
import "./globals.css";
import SwRegister from "@/components/SwRegister";

export const metadata: Metadata = {
  title: "The Sieś Files",
  description: "Mobilna aplikacja towarzysząca do gry w dedukcję społeczną The Sieś Files.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "The Sieś Files",
  },
};

export const viewport: Viewport = {
  themeColor: "#11130f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body className="antialiased">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}

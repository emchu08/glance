import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { EB_Garamond, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// Retained for the wordmark on the secondary pages (privacy, terms, merchant, orders).
const garamond = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-garamond", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Glance — Buy with your eyes", template: "%s · Glance" },
  description: "An AI shopping assistant for smart glasses that recognizes what you look at, finds better prices, and saves it without reaching for a phone.",
  applicationName: "Glance",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#14120c",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${GeistMono.variable} ${garamond.variable}`}>
      <body>{children}</body>
    </html>
  );
}

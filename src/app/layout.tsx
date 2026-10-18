import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { EB_Garamond } from "next/font/google";
import "./globals.css";

// Display serif for headlines, the lens wordmark, and the secondary pages.
const garamond = EB_Garamond({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-garamond", display: "swap" });

export const metadata: Metadata = {
  title: { default: "Glance — Buy with your eyes", template: "%s · Glance" },
  description: "An AI shopping assistant for smart glasses that recognizes what you look at, finds better prices, and saves it without reaching for a phone.",
  applicationName: "Glance",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#207bb9",
  colorScheme: "dark",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${garamond.variable}`}>
      <body>{children}</body>
    </html>
  );
}

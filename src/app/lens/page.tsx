import type { Metadata, Viewport } from "next";
import { LensRuntime } from "./LensRuntime";

export const metadata: Metadata = {
  title: "Lens",
  other: { "mrbd-web-app-capable": "yes" },
  icons: { icon: "/icons/icon-96.png", apple: "/icons/apple-touch-icon-180.png" },
};

export const viewport: Viewport = {
  width: 600,
  height: 600,
  initialScale: 1,
  userScalable: false,
  themeColor: "#000000",
  colorScheme: "dark",
};

export default async function LensPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const dev = process.env.NODE_ENV !== "production";
  const screen = dev && typeof sp.screen === "string" ? sp.screen : undefined;
  const source = typeof sp.source === "string" ? sp.source : undefined;
  const grocery = typeof sp.grocery === "string" ? sp.grocery : undefined;
  return (
    <div style={{ position: "fixed", inset: 0, width: 600, height: 600, background: "#000", overflow: "hidden" }}>
      <LensRuntime fixtureScreen={screen} source={source} groceryEntry={grocery === "enter"} />
    </div>
  );
}

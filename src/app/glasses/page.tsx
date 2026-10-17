import type { Metadata, Viewport } from "next";
import { GlassesPreview } from "./GlassesPreview";

export const metadata: Metadata = { title: "Glasses view" };
export const viewport: Viewport = { themeColor: "#000000", colorScheme: "dark" };

export default async function GlassesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const source = typeof sp.source === "string" ? sp.source : "sample";
  return <GlassesPreview source={source} />;
}

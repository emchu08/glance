import type { Metadata, Viewport } from "next";
import { Presenter } from "./Presenter";

export const metadata: Metadata = { title: "Live demo" };
export const viewport: Viewport = { themeColor: "#eef3fb", colorScheme: "light" };

export default async function DemoPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  return <Presenter groceryEntry={sp.grocery === "enter"} />;
}

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Glance — Buy with your eyes.",
  description: "Experience Glance, an AI shopping assistant concept for smart glasses.",
};

export default function Home() {
  return (
    <main className="h-svh w-full overflow-hidden bg-[#d9efff]">
      <iframe
        className="h-full w-full border-0"
        src="/website/index.html"
        title="Glance — Buy with your eyes"
      />
    </main>
  );
}

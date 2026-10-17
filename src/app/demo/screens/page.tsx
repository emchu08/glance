import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FIXTURE_IDS, PAYMENT_FIXTURE_IDS } from "@/lens/fixtures";
import { FixtureTile } from "./FixtureTile";

export const metadata: Metadata = { title: "Screen gallery (dev)" };

/** Development-only 42-tile gallery (21 ids × sample/live) plus payment/connection fixtures. Production returns 404. */
export default function ScreensGallery() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="min-h-dvh bg-canvas px-6 py-10 text-fg">
      <div className="mx-auto max-w-[1400px]">
        <h1 className="text-2xl font-semibold">Lens fixtures</h1>
        <p className="mt-1 text-sm text-muted">{FIXTURE_IDS.length} ids × sample + simulated-live = {FIXTURE_IDS.length * 2} tiles, plus {PAYMENT_FIXTURE_IDS.length} payment and connection states. Effects, paid search, and handoff are disabled. <Link className="underline" href="/demo">Back to presenter</Link></p>
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-subtle">Core 21 · sample vs live-shaped</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {FIXTURE_IDS.flatMap((id) => [<FixtureTile key={`${id}-s`} id={id} live={false} />, <FixtureTile key={`${id}-l`} id={id} live />])}
          </div>
        </section>
        <section className="mt-12">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-subtle">Payment, wallet, and connection states</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-5">
            {PAYMENT_FIXTURE_IDS.map((id) => <FixtureTile key={id} id={id} live={false} />)}
          </div>
        </section>
      </div>
    </main>
  );
}

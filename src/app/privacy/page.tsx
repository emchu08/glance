import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <article className="prose-invert mx-auto max-w-2xl px-6 py-10 text-[15px] leading-relaxed text-muted">
        <Link href="/" className="font-serif text-2xl text-fg">glance</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-fg">Privacy</h1>
        <p className="mt-2 text-sm">Glance is a concept built at DubHacks 2026. This notice describes what the demo actually does.</p>
        <h2 className="mt-6 font-medium text-fg">Camera frames</h2>
        <p>Recognition is explicit in Glimpse and Gourmet (you press Scan) and sampled about every 3 seconds in Grocery only while scanning is on. Frames are downscaled, sent to our server, analyzed by Claude, and discarded. The relay keeps a frame for at most 20 seconds. Raw frames are never stored in your browser or account history. No face recognition, identity inference, demographic profiling, or eye tracking; "looking at" is estimated from where you face.</p>
        <h2 className="mt-6 font-medium text-fg">Account and wallet</h2>
        <p>Your Glance account (Supabase Auth) stores your email, device registrations, preferences, delivery details you enter, purchase rules, and order history. Card details are collected and stored by Stripe; Glance keeps only a customer reference and the masked brand, last four digits, and expiry. Removing your card detaches it at Stripe and pauses Auto-buy.</p>
        <h2 className="mt-6 font-medium text-fg">Purchases</h2>
        <p>A purchase happens only when you select Buy, or when a rule you explicitly enabled matches within the limits you set. Payment status comes from Stripe. Sellers receive the order lines and delivery details needed to fulfill. Advertisers never receive camera frames or card information; sponsored results are labeled.</p>
        <h2 className="mt-6 font-medium text-fg">Retention and deletion</h2>
        <p>Pairing codes expire in 30 minutes, handoff links in one hour, quotes in 10 minutes. Orders, payment attempts, refunds, and commission records are retained as financial records even if you delete your wallet. You can request account deletion through the repository maintainers.</p>
        <h2 className="mt-6 font-medium text-fg">Not affiliated with Meta</h2>
        <p>Meta provides device registration for supported glasses through its developer toolkit. Glance does not receive a Meta account identity, saved cards, or billing data from that registration.</p>
      </article>
    </main>
  );
}

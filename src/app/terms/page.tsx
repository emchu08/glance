import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <article className="mx-auto max-w-2xl px-6 py-10 text-[15px] leading-relaxed text-muted">
        <Link href="/" className="font-serif text-2xl text-fg">glance</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-fg">Terms</h1>
        <p className="mt-2 text-sm">Demo terms for the Glance hackathon prototype.</p>
        <h2 className="mt-6 font-medium text-fg">Sandbox payments</h2>
        <p>All payments in this deployment run in Stripe test mode. No real money moves. Live charging is disabled on the server and cannot be enabled from any client.</p>
        <h2 className="mt-6 font-medium text-fg">Sellers and fulfillment</h2>
        <p>Glance Demo Market is a sandbox seller with simulated fulfillment. Offers labeled “External retailer” are discovery links to third-party sites; Glance does not place orders there and does not claim their stock or prices are current. Sample prices are fixtures.</p>
        <h2 className="mt-6 font-medium text-fg">Commission</h2>
        <p>Glance earns a configurable marketplace commission from participating sellers on completed eligible purchases (10% of item subtotal in the sandbox example). It is not an additional buyer charge. Sponsored listings are billed to advertisers separately for qualified clicks or verified conversions.</p>
        <h2 className="mt-6 font-medium text-fg">Auto-buy</h2>
        <p>Auto-buy is off until you enable it. It applies only to the seller, items, quantities, limits, and expiry you approved. Pausing blocks new purchases; it does not reverse a completed charge. Refunds follow the seller’s policy via Stripe.</p>
        <h2 className="mt-6 font-medium text-fg">Support</h2>
        <p>For refunds, disputes, or questions in this demo, open an issue on the project repository.</p>
      </article>
    </main>
  );
}

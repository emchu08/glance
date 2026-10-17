import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { formatCents } from "@/domain/money";
import { getOrderView } from "@/server/commerce";
import { currentUser } from "@/server/supabase";

export const metadata: Metadata = { title: "Receipt" };
export const dynamic = "force-dynamic";

export default async function OrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const user = await currentUser();
  if (!user) return <Gate orderId={orderId} />;
  let order;
  try { order = await getOrderView(user.id, orderId); } catch { notFound(); }
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-lg px-6 py-10">
        <Link href="/" className="font-serif text-2xl">glance</Link>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight">Receipt</h1>
        <p className="text-muted">{order.merchantName} · Ref {order.reference}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-surface p-5">
          {order.lines.map((l) => <div key={l.name} className="flex justify-between py-1"><span>{l.quantity} × {l.name}</span><span>{formatCents(l.lineTotalCents)}</span></div>)}
          <div className="mt-3 flex justify-between border-t border-white/10 pt-3 text-lg font-semibold"><span>Total</span><span>{formatCents(order.totalCents)}</span></div>
        </div>
        <dl className="mt-6 grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted">Payment</dt><dd>{order.paymentStatus}{order.cardSummary ? ` · ${order.cardSummary}` : ""}</dd>
          <dt className="text-muted">Fulfillment</dt><dd>{order.fulfillmentStatus} · simulated demo fulfillment</dd>
          <dt className="text-muted">Placed</dt><dd>{new Date(order.createdAt).toLocaleString()}</dd>
          <dt className="text-muted">Mode</dt><dd>sandbox · Payments by Stripe</dd>
        </dl>
        <p className="mt-8 text-xs text-subtle">Payment status comes from verified Stripe results and webhooks. Fulfillment is reported separately by the seller adapter. For refunds or support in this demo, contact the Glance team via the repository.</p>
      </div>
    </main>
  );
}

function Gate({ orderId }: { orderId: string }) {
  return (
    <main className="min-h-dvh bg-canvas text-fg">
      <div className="mx-auto max-w-lg px-6 py-10">
        <h1 className="text-2xl font-semibold">Sign in to view this receipt</h1>
        <p className="mt-2 text-muted">Receipts are only shown to the account that placed the order. An order id alone is not a credential.</p>
        <Link href={`/wallet/setup?next=/orders/${orderId}`} className="mt-4 inline-block rounded-full bg-fg px-4 py-2 text-sm font-medium text-canvas">Sign in</Link>
      </div>
    </main>
  );
}
